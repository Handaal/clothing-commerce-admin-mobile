import { useCallback, useReducer, useRef } from "react";

import { classifyCommerceError } from "../../commerce/errors";
import { describeInventoryWriteError } from "../write-errors";
import type { MutationState } from "../../ui/useMutation";
import { runJournaledCommand, type JournaledInventoryClient } from "./command-runner";
import type { InventoryJournal } from "./journal";
import type { JournalPayload } from "./model";

// The reducer mirrors ui/useMutation's four states so the forms render identically; the difference is
// entirely in WHERE identity lives (the durable journal, not a React ref).
function reducer<T>(_state: MutationState<T>, action: ReducerAction<T>): MutationState<T> {
  switch (action.type) {
    case "submitting":
      return { status: "submitting" };
    case "success":
      return { status: "success", data: action.data };
    case "error":
      return { status: "error", error: action.error };
    case "reset":
      return { status: "idle" };
  }
}

type ReducerAction<T> =
  | { type: "submitting" }
  | { type: "success"; data: T }
  | { type: "error"; error: ReturnType<typeof classifyCommerceError> }
  | { type: "reset" };

export interface JournaledMutation<TResult> {
  state: MutationState<TResult>;
  /**
   * Begin a command: PERSIST it (key + normalized payload) to the durable journal BEFORE transport,
   * then dispatch. If an equivalent command is already unresolved for this tenant, its key is reused
   * rather than minting a second one — so a double-submit of the same intent can never mint a duplicate.
   */
  submit: (payload: JournalPayload) => void;
  /** Re-run the SAME journaled command after an ambiguous failure: identical key + payload (at-most-once). */
  retry: () => void;
  /** Acknowledge the resolved command (pruning it) and return to idle for a genuinely new command. */
  reset: () => void;
}

/**
 * The durable replacement for {@link ../../ui/useMutation.useMutation}, used only by the high-risk
 * inventory writes. Command identity is owned by the {@link InventoryJournal}: the key is minted and
 * persisted before transport, kept on an ambiguous failure so a lost-response command is RECOVERABLE
 * after a restart, and pruned only once resolved. A monotonic sequence still guards against a stale
 * response from a superseded/abandoned operation settling newer state.
 */
export function useJournaledInventoryMutation<TResult extends object>(options: {
  client: JournaledInventoryClient;
  journal: InventoryJournal;
  tenantId: string;
}): JournaledMutation<TResult> {
  const { client, journal, tenantId } = options;
  const [state, dispatch] = useReducer(reducer<TResult>, { status: "idle" });

  // The CURRENT operation's durable key + payload, cached for this mounted session only. The journal
  // remains the source of truth (these are re-derivable from it); they are never the durable record.
  const keyRef = useRef<string | null>(null);
  const payloadRef = useRef<JournalPayload | null>(null);
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);

  const run = useCallback(
    (seq: number) => {
      const key = keyRef.current;
      const payload = payloadRef.current;
      if (key === null || payload === null) return;
      inFlightRef.current = true;
      dispatch({ type: "submitting" });
      void journal.markSent(key).then(() => {
        runJournaledCommand(client, payload, key).then(
          async (data) => {
            if (seq !== seqRef.current) return; // superseded/abandoned — do not settle
            await journal.recordAccepted(key, data);
            inFlightRef.current = false;
            dispatch({ type: "success", data: data as TResult });
          },
          async (error) => {
            if (seq !== seqRef.current) return;
            const classified = classifyCommerceError(error);
            // Only a genuinely AMBIGUOUS outcome (transport/5xx → "retry") may have applied server-side;
            // keep it unresolved so recovery can replay the same key. Every definitive rejection did NOT
            // apply, so the journal entry is discarded.
            if (describeInventoryWriteError(classified).recovery !== "retry") {
              await journal.discard(key);
            }
            inFlightRef.current = false;
            dispatch({ type: "error", error: classified });
          },
        );
      });
    },
    [client, journal],
  );

  const submit = useCallback(
    (payload: JournalPayload) => {
      if (inFlightRef.current) return; // duplicate-tap guard
      seqRef.current += 1;
      const seq = seqRef.current;
      inFlightRef.current = true; // hold the guard across the async prepare
      void journal.prepare(tenantId, payload).then((entry) => {
        if (seq !== seqRef.current) {
          inFlightRef.current = false;
          return;
        }
        keyRef.current = entry.commandKey;
        payloadRef.current = entry.payload;
        inFlightRef.current = false;
        run(seq);
      });
    },
    [journal, tenantId, run],
  );

  const retry = useCallback(() => {
    if (inFlightRef.current) return;
    if (keyRef.current === null || payloadRef.current === null) return;
    run(seqRef.current); // same key + payload, same sequence: this response is still accepted
  }, [run]);

  const reset = useCallback(() => {
    seqRef.current += 1; // invalidate any in-flight response from the abandoned operation
    inFlightRef.current = false;
    const key = keyRef.current;
    keyRef.current = null;
    payloadRef.current = null;
    // A resolved (accepted) command is pruned on acknowledgement; an unresolved one is intentionally
    // left for the recovery surface and never silently dropped here.
    if (key !== null) void journal.acknowledge(key);
    dispatch({ type: "reset" });
  }, [journal]);

  return { state, submit, retry, reset };
}
