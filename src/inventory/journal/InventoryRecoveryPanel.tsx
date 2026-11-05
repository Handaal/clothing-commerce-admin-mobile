import { useCallback, useEffect, useReducer, useRef } from "react";
import { View } from "react-native";

import { classifyCommerceError } from "../../commerce/errors";
import { t as translate, useI18n } from "../../i18n";
import { Badge, Body, Divider, InfoRow, PrimaryButton, Title } from "../../ui/components";
import type { InventoryItem } from "../load";
import type { InventoryLocationRef } from "../InventoryOperations";
import { describeInventoryWriteError } from "../write-errors";
import { runJournaledCommand, type JournaledInventoryClient } from "./command-runner";
import { isCrossContextSafe } from "./coordinator";
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
   * Report whether high-risk mutations may proceed. False while the journal is corrupt/unavailable, a
   * legacy journal needs reconciliation, or the runtime cannot safely serialize journal writes across
   * contexts (web without Web Locks) — the parent hides the write forms but keeps read-only inventory.
   */
  onAvailabilityChange?: (available: boolean) => void;
  /**
   * Whether journal writes can be safely serialized across every context sharing this device's durable
   * journal (see {@link isCrossContextSafe}). Injectable for tests; defaults to the live capability. When
   * false (web without Web Locks) the panel is READ-ONLY: pending operations are still listed so the
   * operator can see them, but replay/acknowledge/archive are disabled and writes are reported blocked.
   */
  crossContextSafe?: boolean;
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
  | { kind: "legacy" }
  // Web without Web Locks: the list is shown READ-ONLY (no safe way to write/replay across tabs).
  | { kind: "incompatible" };

interface PanelState {
  availability: Availability;
  entries: JournalEntry[];
  statuses: Record<string, RowStatus>;
}

type PanelAction =
  | { type: "loaded"; entries: JournalEntry[] }
  | { type: "unavailable"; reason: "corrupt" | "storage" }
  | { type: "legacy" }
  | { type: "incompatible"; entries: JournalEntry[] }
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
        heading: translate("invRecovery.notApplied"),
        message: translate("invRecovery.notAppliedMsg"),
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
    case "incompatible": {
      const statuses: Record<string, RowStatus> = {};
      for (const entry of action.entries)
        statuses[entry.commandKey] = initialRowStatus(entry.status);
      return { availability: { kind: "incompatible" }, entries: action.entries, statuses };
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
  crossContextSafe = isCrossContextSafe(),
}: InventoryRecoveryPanelProps) {
  const { t } = useI18n();
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
      // Reading the recoverable set is safe (no mutation) even without cross-context locking, so we
      // still surface pending work. But WRITES are not safe without it, so report unavailable and keep
      // the panel read-only (replay/acknowledge/archive disabled).
      const entries = await journal.findRecoverable();
      if (!crossContextSafe) {
        onAvailabilityRef.current?.(false);
        return { type: "incompatible" as const, entries };
      }
      onAvailabilityRef.current?.(true);
      return { type: "loaded" as const, entries };
    } catch (error) {
      const reason: "corrupt" | "storage" =
        error instanceof JournalCorruptError ? "corrupt" : "storage";
      onAvailabilityRef.current?.(false);
      return { type: "unavailable" as const, reason };
    }
  }, [journal, detectLegacy, crossContextSafe]);

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
        await journal.markSent(entry.commandKey, entry.payloadIdentity);
      } catch {
        // The durable entry disappeared or storage failed: fail closed, do NOT transport.
        dispatch({ type: "unavailable", reason: "storage" });
        onAvailabilityRef.current?.(false);
        return;
      }
      try {
        const result = await runJournaledCommand(client, entry.payload, entry.commandKey);
        await journal.recordAccepted(entry.commandKey, result, entry.payloadIdentity);
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
          await journal.recordRejected(entry.commandKey, entry.payloadIdentity);
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
        await journal.acknowledge(entry.commandKey, entry.payloadIdentity);
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
        <Title>{t("invOps.storagePausedTitle")}</Title>
        <Body>
          {state.availability.reason === "corrupt"
            ? t("invRecovery.blockedCorrupt")
            : t("invRecovery.blockedStorage")}
        </Body>
      </View>
    );
  }

  if (state.availability.kind === "legacy") {
    return (
      <View style={{ gap: 12 }} testID="inventory-recovery-legacy">
        <Divider />
        <Title>{t("invRecovery.legacyTitle")}</Title>
        <Body>{t("invRecovery.legacyBody")}</Body>
        {/* Archiving MUTATES storage. When cross-context locking is unavailable (web without Web
            Locks) the evidence stays visible but the mutation action is NOT offered — archiving must
            happen in the app or a supported browser with a single tab. */}
        {!crossContextSafe ? (
          <Body testID="recovery-legacy-incompatible">{t("invRecovery.legacyIncompatible")}</Body>
        ) : quarantineLegacy ? (
          <PrimaryButton
            label={t("invRecovery.archiveContinue")}
            testID="recovery-legacy-archive"
            onPress={() => void archiveLegacy()}
          />
        ) : null}
      </View>
    );
  }

  // Web without Web Locks: writes cannot be safely serialized across tabs, so the panel is read-only.
  const incompatible = state.availability.kind === "incompatible";
  const writesEnabled = state.availability.kind === "available";

  const compatibilityNotice = incompatible ? (
    <View style={{ gap: 8 }} testID="inventory-recovery-incompatible">
      <Divider />
      <Title>{t("invRecovery.incompatibleTitle")}</Title>
      <Body>{t("invRecovery.incompatibleBody")}</Body>
    </View>
  ) : null;

  if (state.entries.length === 0) return compatibilityNotice;

  return (
    <View style={{ gap: 12 }} testID="inventory-recovery">
      {compatibilityNotice}
      <Divider />
      <Title>{t("invRecovery.unfinishedTitle")}</Title>
      <Body>
        {writesEnabled
          ? t("invRecovery.unfinishedBody")
          : t("invRecovery.unfinishedBodyReadOnly")}
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
            <InfoRow label={t("invRecovery.operation")} value={describePayload(entry.payload, items, locations)} />
            {status.kind === "accepted" ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Body>{t("invRecovery.completed")}</Body>
                <Badge label={t("invRecovery.applied")} testID={`recovery-resolved-${entry.commandKey}`} />
                {writesEnabled ? (
                  <PrimaryButton
                    label={t("common.dismiss")}
                    testID={`recovery-ack-${entry.commandKey}`}
                    onPress={() => void acknowledge(entry)}
                  />
                ) : null}
              </View>
            ) : null}
            {status.kind === "rejected" ? (
              <View style={{ gap: 8 }} testID={`recovery-rejected-${entry.commandKey}`}>
                <Title>{status.heading}</Title>
                <Body>{status.message}</Body>
                {writesEnabled ? (
                  <PrimaryButton
                    label={t("common.dismiss")}
                    testID={`recovery-ack-${entry.commandKey}`}
                    onPress={() => void acknowledge(entry)}
                  />
                ) : null}
              </View>
            ) : null}
            {status.kind === "ambiguous" ? (
              <View style={{ gap: 8 }} testID={`recovery-ambiguous-${entry.commandKey}`}>
                <Body>{status.message}</Body>
                {writesEnabled ? (
                  <PrimaryButton
                    label={t("invRecovery.tryAgain")}
                    testID={`recovery-replay-${entry.commandKey}`}
                    onPress={() => void replay(entry)}
                  />
                ) : null}
              </View>
            ) : null}
            {status.kind === "unresolved" ? (
              <>
                <Body>
                  {status.sent
                    ? t("invRecovery.unresolvedSent")
                    : t("invRecovery.unresolvedPrepared")}
                </Body>
                {writesEnabled ? (
                  <PrimaryButton
                    label={t("invRecovery.completeThis")}
                    testID={`recovery-replay-${entry.commandKey}`}
                    onPress={() => void replay(entry)}
                  />
                ) : null}
              </>
            ) : null}
            {status.kind === "replaying" ? <Body>{t("invRecovery.completing")}</Body> : null}
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
      const supplier = payload.supplierId ? translate("invRecovery.supplierLinked") : "";
      return translate("invRecovery.describeReceive", {
        quantity: payload.quantity,
        variant,
        where,
        supplier,
      });
    }
    case "adjust": {
      const where = locationName(locations, payload.inventoryLocationId);
      return translate("invRecovery.describeAdjust", {
        variant,
        where,
        counted: payload.countedQuantity,
      });
    }
    case "transfer": {
      const from = locationName(locations, payload.sourceInventoryLocationId);
      const to = locationName(locations, payload.destinationInventoryLocationId);
      return translate("invRecovery.describeTransfer", {
        quantity: payload.quantity,
        variant,
        from,
        to,
      });
    }
  }
}
