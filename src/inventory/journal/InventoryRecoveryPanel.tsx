import { useCallback, useEffect, useReducer, useRef } from "react";
import { View } from "react-native";

import { classifyCommerceError } from "../../commerce/errors";
import {
  Badge,
  Body,
  Divider,
  InfoRow,
  PrimaryButton,
  TextButton,
  Title,
} from "../../ui/components";
import type { InventoryItem } from "../load";
import type { InventoryLocationRef } from "../InventoryOperations";
import { describeInventoryWriteError } from "../write-errors";
import { runJournaledCommand, type JournaledInventoryClient } from "./command-runner";
import type { InventoryJournal } from "./journal";
import type { JournalEntry, JournalPayload } from "./model";

export interface InventoryRecoveryPanelProps {
  journal: InventoryJournal;
  tenantId: string;
  client: JournaledInventoryClient;
  items: InventoryItem[];
  locations: InventoryLocationRef[];
  /** Re-read authoritative inventory after a recovered command settles (once resolved). */
  onResolved: () => void;
}

type RowStatus =
  | { kind: "unresolved" }
  | { kind: "replaying" }
  | { kind: "resolved" }
  | { kind: "ambiguous"; message: string }
  | { kind: "rejected"; heading: string; message: string };

interface PanelState {
  loaded: boolean;
  entries: JournalEntry[];
  statuses: Record<string, RowStatus>;
}

type PanelAction =
  | { type: "loaded"; entries: JournalEntry[] }
  | { type: "status"; key: string; status: RowStatus }
  | { type: "remove"; key: string };

// State transitions go through a reducer (never a bare setState in the effect), mirroring useAsync and
// the SessionProvider lifecycle model.
function reducer(state: PanelState, action: PanelAction): PanelState {
  switch (action.type) {
    case "loaded":
      return { ...state, loaded: true, entries: action.entries };
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
 * The restart/remount recovery surface. On mount it prunes stale resolved results, then lists every
 * inventory command that is still UNRESOLVED for the active tenant — a command whose response was lost
 * before we knew whether it applied. The operator resolves each by replaying it, which reuses the
 * ORIGINAL idempotency key and payload so the server applies it at most once. New equivalent commands
 * are already deduped by the journal (same key), but this surface makes the pending state explicit and
 * requires a deliberate resolution rather than silently allowing a repeat mutation. Unrelated read-only
 * work elsewhere in the app remains fully usable while this is shown.
 */
export function InventoryRecoveryPanel({
  journal,
  tenantId,
  client,
  items,
  locations,
  onResolved,
}: InventoryRecoveryPanelProps) {
  const [state, dispatch] = useReducer(reducer, { loaded: false, entries: [], statuses: {} });
  const onResolvedRef = useRef(onResolved);
  useEffect(() => {
    onResolvedRef.current = onResolved;
  });

  useEffect(() => {
    let active = true;
    void (async () => {
      await journal.pruneResolved(tenantId);
      const unresolved = await journal.findUnresolved(tenantId);
      if (active) dispatch({ type: "loaded", entries: unresolved });
    })();
    return () => {
      active = false;
    };
  }, [journal, tenantId]);

  const replay = useCallback(
    async (entry: JournalEntry) => {
      dispatch({ type: "status", key: entry.commandKey, status: { kind: "replaying" } });
      await journal.markSent(entry.commandKey);
      try {
        const result = await runJournaledCommand(client, entry.payload, entry.commandKey);
        await journal.recordAccepted(entry.commandKey, result);
        dispatch({ type: "status", key: entry.commandKey, status: { kind: "resolved" } });
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
        // Definitive rejection: it never applied. Discard it and refresh authoritative inventory.
        await journal.discard(entry.commandKey);
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
      await journal.acknowledge(entry.commandKey);
      dispatch({ type: "remove", key: entry.commandKey });
    },
    [journal],
  );

  if (!state.loaded || state.entries.length === 0) return null;

  return (
    <View style={{ gap: 12 }} testID="inventory-recovery">
      <Divider />
      <Title>Unfinished inventory operations</Title>
      <Body>
        These operations were started but their result was not confirmed. Complete each one to apply
        it safely — this reuses the original request, so it can never be counted twice. Start a new
        equivalent operation only after these are resolved.
      </Body>
      {state.entries.map((entry) => {
        const status = state.statuses[entry.commandKey] ?? { kind: "unresolved" };
        return (
          <View
            key={entry.commandKey}
            style={{ gap: 8 }}
            testID={`recovery-entry-${entry.commandKey}`}
          >
            <Divider />
            <InfoRow label="Operation" value={describePayload(entry.payload, items, locations)} />
            {status.kind === "resolved" ? (
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
              <PrimaryButton
                label="Complete this operation"
                testID={`recovery-replay-${entry.commandKey}`}
                onPress={() => void replay(entry)}
              />
            ) : null}
            {status.kind === "replaying" ? <Body>Completing…</Body> : null}
            {status.kind === "unresolved" ? (
              <TextButton
                label="Discard without completing"
                onPress={() => void acknowledge(entry)}
              />
            ) : null}
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
