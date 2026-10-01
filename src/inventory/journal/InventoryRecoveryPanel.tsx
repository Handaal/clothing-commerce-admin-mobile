import { useCallback, useEffect, useReducer, useRef } from "react";
import { View } from "react-native";

import { classifyCommerceError } from "../../commerce/errors";
import { Badge, Body, Divider, InfoRow, PrimaryButton, Title } from "../../ui/components";
import type { InventoryItem } from "../load";
import type { InventoryLocationRef } from "../InventoryOperations";
import { describeInventoryWriteError } from "../write-errors";
import { runJournaledCommand, type JournaledInventoryClient } from "./command-runner";
import type { InventoryJournal } from "./journal";
import { JournalCorruptError, type JournalEntry, type JournalPayload } from "./model";

export interface InventoryRecoveryPanelProps {
  journal: InventoryJournal;
  client: JournaledInventoryClient;
  items: InventoryItem[];
  locations: InventoryLocationRef[];
  /** Re-read authoritative inventory after a recovered command settles (once resolved). */
  onResolved: () => void;
  /**
   * Detect unresolved entries in the RELEASED V1 journal for this tenant. They lack a membership owner
   * and are quarantined (never auto-replayed under the current user); returning a non-empty result
   * blocks new mutations until the operator archives them.
   */
  detectLegacy?: () => Promise<JournalEntry[]>;
  /** Archive (preserve, never delete) the legacy V1 journal so new mutations can resume. */
  quarantineLegacy?: () => Promise<void>;
  /**
   * Report whether high-risk mutations may proceed. False while the journal is corrupt/unavailable or a
   * legacy journal needs reconciliation — the parent hides the write forms but keeps read-only inventory.
   */
  onAvailabilityChange?: (available: boolean) => void;
}

type RowStatus =
  | { kind: "unresolved"; sent: boolean }
  | { kind: "replaying" }
  | { kind: "accepted" }
  | { kind: "ambiguous"; message: string }
  | { kind: "rejected"; heading: string; message: string };

type Availability =
  | { kind: "loading" }
  | { kind: "available" }
  | { kind: "blocked"; reason: "corrupt" | "storage" }
  | { kind: "legacy" };

interface PanelState {
  availability: Availability;
  entries: JournalEntry[];
  statuses: Record<string, RowStatus>;
}

type PanelAction =
  | { type: "loaded"; entries: JournalEntry[] }
  | { type: "unavailable"; reason: "corrupt" | "storage" }
  | { type: "legacy" }
  | { type: "status"; key: string; status: RowStatus }
  | { type: "remove"; key: string };

function initialRowStatus(status: JournalEntry["status"]): RowStatus {
  switch (status) {
    case "prepared":
      return { kind: "unresolved", sent: false };
    case "accepted":
      return { kind: "accepted" };
    case "rejected":
      return {
        kind: "rejected",
        heading: "Not applied",
        message: "The server refused this operation, so it did not change stock. Dismiss it.",
      };
    case "sent":
    case "acknowledged":
      return { kind: "unresolved", sent: true };
  }
}

function reducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "loaded": {
      const statuses: Record<string, RowStatus> = {};
      for (const entry of action.entries)
        statuses[entry.commandKey] = initialRowStatus(entry.status);
      return { availability: { kind: "available" }, entries: action.entries, statuses };
    }
    case "unavailable":
      return { ...state, availability: { kind: "blocked", reason: action.reason } };
    case "legacy":
      return { ...state, availability: { kind: "legacy" } };
    case "status":
      return { ...state, statuses: { ...state.statuses, [action.key]: action.status } };
    case "remove": {
      const statuses = { ...state.statuses };
      delete statuses[action.key];
      return {
        ...state,
        entries: state.entries.filter((entry) => entry.commandKey !== action.key),
        statuses,
      };
    }
  }
}

/**
 * The restart/remount recovery surface. On mount it loads every not-yet-acknowledged command for the
 * active OWNER (tenant + membership): unresolved commands awaiting completion AND resolved commands
 * (accepted/rejected) awaiting acknowledgement. Nothing is auto-pruned — an `accepted` result survives a
 * restart and stays visible until the operator explicitly acknowledges it.
 *
 * The operator completes an unresolved command by replaying it, which reuses the ORIGINAL idempotency
 * key and payload so the server applies it at most once. There is deliberately NO generic "discard" for
 * an unresolved command: its durable key is the only identity for a mutation the server may already have
 * committed, so it can only be completed/reconciled, never dismissed away.
 *
 * If durable storage is corrupt/unavailable, or a released V1 journal needs reconciliation, the panel
 * shows a blocking (non-destructive) notice and reports unavailability so the parent hides the write
 * forms. Unrelated read-only Admin work stays fully usable throughout.
 */
export function InventoryRecoveryPanel({
  journal,
  client,
  items,
  locations,
  onResolved,
  detectLegacy,
  quarantineLegacy,
  onAvailabilityChange,
}: InventoryRecoveryPanelProps) {
  const [state, dispatch] = useReducer(reducer, {
    availability: { kind: "loading" },
    entries: [],
    statuses: {},
  });
  const onResolvedRef = useRef(onResolved);
  const onAvailabilityRef = useRef(onAvailabilityChange);
  useEffect(() => {
    onResolvedRef.current = onResolved;
    onAvailabilityRef.current = onAvailabilityChange;
  });

  const load = useCallback(async () => {
    try {
      // Legacy V1 is checked first: an un-attributable legacy journal must block new mutations.
      if (detectLegacy) {
        const legacy = await detectLegacy();
        if (legacy.length > 0) {
          onAvailabilityRef.current?.(false);
          return { type: "legacy" as const };
        }
      }
      const entries = await journal.findRecoverable();
      onAvailabilityRef.current?.(true);
      return { type: "loaded" as const, entries };
    } catch (error) {
      const reason: "corrupt" | "storage" =
        error instanceof JournalCorruptError ? "corrupt" : "storage";
      onAvailabilityRef.current?.(false);
      return { type: "unavailable" as const, reason };
    }
  }, [journal, detectLegacy]);

  useEffect(() => {
    let active = true;
    void load().then((action) => {
      if (active) dispatch(action);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const replay = useCallback(
    async (entry: JournalEntry) => {
      dispatch({ type: "status", key: entry.commandKey, status: { kind: "replaying" } });
      try {
        await journal.markSent(entry.commandKey);
      } catch {
        // The durable entry disappeared or storage failed: fail closed, do NOT transport.
        dispatch({ type: "unavailable", reason: "storage" });
        onAvailabilityRef.current?.(false);
        return;
      }
      try {
        const result = await runJournaledCommand(client, entry.payload, entry.commandKey);
        await journal.recordAccepted(entry.commandKey, result);
        dispatch({ type: "status", key: entry.commandKey, status: { kind: "accepted" } });
        onResolvedRef.current();
      } catch (error) {
        const described = describeInventoryWriteError(classifyCommerceError(error));
        if (described.recovery === "retry") {
          // Still ambiguous: keep the command unresolved so it can be replayed again with the same key.
          dispatch({
            type: "status",
            key: entry.commandKey,
            status: { kind: "ambiguous", message: described.message },
          });
          return;
        }
        // Definitive rejection: it never applied. Move to `rejected` (kept until acknowledged) and
        // refresh authoritative inventory.
        try {
          await journal.recordRejected(entry.commandKey);
        } catch {
          // Already resolved/gone; the rejection UI below still stands.
        }
        dispatch({
          type: "status",
          key: entry.commandKey,
          status: { kind: "rejected", heading: described.heading, message: described.message },
        });
        onResolvedRef.current();
      }
    },
    [client, journal],
  );

  const acknowledge = useCallback(
    async (entry: JournalEntry) => {
      try {
        await journal.acknowledge(entry.commandKey);
        dispatch({ type: "remove", key: entry.commandKey });
      } catch {
        // Refused (still unresolved) or storage failure — leave the row in place; never lose it.
      }
    },
    [journal],
  );

  const archiveLegacy = useCallback(async () => {
    if (!quarantineLegacy) return;
    await quarantineLegacy();
    void load().then(dispatch);
  }, [quarantineLegacy, load]);

  if (state.availability.kind === "loading") return null;

  if (state.availability.kind === "blocked") {
    return (
      <View style={{ gap: 12 }} testID="inventory-recovery-blocked">
        <Divider />
        <Title>Inventory changes temporarily unavailable</Title>
        <Body>
          {state.availability.reason === "corrupt"
            ? "The inventory recovery journal could not be read and needs attention before new stock changes can be made. Your other Admin data is unaffected."
            : "The inventory recovery journal could not be saved, so inventory changes are temporarily unavailable. Your other Admin data is unaffected."}
        </Body>
      </View>
    );
  }

  if (state.availability.kind === "legacy") {
    return (
      <View style={{ gap: 12 }} testID="inventory-recovery-legacy">
        <Divider />
        <Title>An earlier inventory operation needs attention</Title>
        <Body>
          An inventory recovery journal from a previous app version was found. It cannot be
          attributed to your account automatically, so new inventory changes are paused until it is
          reviewed and archived. This never resends those operations on your behalf.
        </Body>
        {quarantineLegacy ? (
          <PrimaryButton
            label="Archive and continue"
            testID="recovery-legacy-archive"
            onPress={() => void archiveLegacy()}
          />
        ) : null}
      </View>
    );
  }

  if (state.entries.length === 0) return null;

  return (
    <View style={{ gap: 12 }} testID="inventory-recovery">
      <Divider />
      <Title>Unfinished inventory operations</Title>
      <Body>
        These operations were started but their result was not confirmed, or are awaiting your
        acknowledgement. Complete each unresolved one to apply it safely — this reuses the original
        request, so it can never be counted twice. Start a new equivalent operation only after these
        are resolved.
      </Body>
      {state.entries.map((entry) => {
        const status = state.statuses[entry.commandKey] ?? { kind: "unresolved", sent: true };
        return (
          <View
            key={entry.commandKey}
            style={{ gap: 8 }}
            testID={`recovery-entry-${entry.commandKey}`}
          >
            <Divider />
            <InfoRow label="Operation" value={describePayload(entry.payload, items, locations)} />
            {status.kind === "accepted" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Body>Completed</Body>
                <Badge label="Applied" testID={`recovery-resolved-${entry.commandKey}`} />
                <PrimaryButton
                  label="Dismiss"
                  testID={`recovery-ack-${entry.commandKey}`}
                  onPress={() => void acknowledge(entry)}
                />
              </View>
            ) : null}
            {status.kind === "rejected" ? (
              <View style={{ gap: 8 }} testID={`recovery-rejected-${entry.commandKey}`}>
                <Title>{status.heading}</Title>
                <Body>{status.message}</Body>
                <PrimaryButton
                  label="Dismiss"
                  testID={`recovery-ack-${entry.commandKey}`}
                  onPress={() => void acknowledge(entry)}
                />
              </View>
            ) : null}
            {status.kind === "ambiguous" ? (
              <View style={{ gap: 8 }} testID={`recovery-ambiguous-${entry.commandKey}`}>
                <Body>{status.message}</Body>
                <PrimaryButton
                  label="Try to complete again"
                  testID={`recovery-replay-${entry.commandKey}`}
                  onPress={() => void replay(entry)}
                />
              </View>
            ) : null}
            {status.kind === "unresolved" ? (
              <>
                <Body>
                  {status.sent
                    ? "This operation was sent but not confirmed. It may already have been applied; completing it reuses the original request so it is never counted twice."
                    : "This operation was prepared but not sent. Complete it to apply it safely."}
                </Body>
                <PrimaryButton
                  label="Complete this operation"
                  testID={`recovery-replay-${entry.commandKey}`}
                  onPress={() => void replay(entry)}
                />
              </>
            ) : null}
            {status.kind === "replaying" ? <Body>Completing…</Body> : null}
          </View>
        );
      })}
    </View>
  );
}

function variantLabel(items: InventoryItem[], variantId: string): string {
  const found = items.find((item) => item.variantId === variantId);
  return found ? `${found.productName} · ${found.sku}` : variantId;
}

function locationName(locations: InventoryLocationRef[], id: string): string {
  return locations.find((location) => location.id === id)?.name ?? id;
}

/** Human, non-technical description of a journaled command for the recovery list. */
function describePayload(
  payload: JournalPayload,
  items: InventoryItem[],
  locations: InventoryLocationRef[],
): string {
  const variant = variantLabel(items, payload.variantId);
  switch (payload.type) {
    case "receive": {
      const where = locationName(locations, payload.inventoryLocationId);
      const supplier = payload.supplierId ? " (supplier-linked)" : "";
      return `Receive ${payload.quantity} × ${variant} into ${where}${supplier}`;
    }
    case "adjust": {
      const where = locationName(locations, payload.inventoryLocationId);
      return `Reconcile ${variant} at ${where} to a count of ${payload.countedQuantity}`;
    }
    case "transfer": {
      const from = locationName(locations, payload.sourceInventoryLocationId);
      const to = locationName(locations, payload.destinationInventoryLocationId);
      return `Transfer ${payload.quantity} × ${variant} from ${from} to ${to}`;
    }
  }
}
