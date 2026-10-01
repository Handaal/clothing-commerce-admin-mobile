import { useCallback, useReducer, useRef } from "react";

import { classifyCommerceError } from "../../commerce/errors";
import { describeInventoryWriteError } from "../write-errors";
import { runJournaledCommand, type JournaledInventoryClient } from "./command-runner";
import type { InventoryJournal } from "./journal";
import {
  CrossContextLockUnavailableError,
  JournalCorruptError,
  JournalStorageError,
  payloadIdentity,
  type JournalPayload,
} from "./model";

type ClassifiedError = ReturnType<typeof classifyCommerceError>;

/**
 * Why a journaled mutation is blocked without ever having been transported:
 * - `storage-unavailable` — durable persistence could not be secured (write/corruption). FAIL CLOSED:
 *   no API request was issued, since we could not durably record the command's identity first.
 * - `pending-equivalent` — an equivalent command is already unresolved for this owner. The operator must
 *   resume/retry it in the recovery panel; a new fresh-looking submission would be misleading and a
 *   second key is never minted.
 */
export type JournalBlockedReason = "storage-unavailable" | "pending-equivalent";

/** The journaled write lifecycle. Mirrors `ui/useMutation` but adds a durability `blocked` state. */
export type JournaledMutationState<T> =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; data: T }
  | { status: "error"; error: ClassifiedError }
  | { status: "blocked"; reason: JournalBlockedReason };

function reducer<T>(
  _state: JournaledMutationState<T>,
  action: ReducerAction<T>,
): JournaledMutationState<T> {
  switch (action.type) {
    case "submitting":
      return { status: "submitting" };
    case "success":
      return { status: "success", data: action.data };
    case "error":
      return { status: "error", error: action.error };
    case "blocked":
      return { status: "blocked", reason: action.reason };
    case "reset":
      return { status: "idle" };
  }
}

type ReducerAction<T> =
  | { type: "submitting" }
  | { type: "success"; data: T }
  | { type: "error"; error: ClassifiedError }
  | { type: "blocked"; reason: JournalBlockedReason }
  | { type: "reset" };

export interface JournaledMutation<TResult> {
  state: JournaledMutationState<TResult>;
  /**
   * Begin a command. If an equivalent command is already unresolved, the submission is BLOCKED and the
   * operator is directed to the recovery panel (no second key, no fresh-looking send). Otherwise the
   * command is PERSISTED (key + normalized payload) to the durable journal BEFORE transport, then
   * dispatched. If durable persistence fails, the submission is BLOCKED and the API is never called.
   */
  submit: (payload: JournalPayload) => void;
  /** Re-run the SAME journaled command after an ambiguous failure: identical key + payload (at-most-once). */
  retry: () => void;
  /** Acknowledge the resolved command (pruning it) and return to idle for a genuinely new command. */
  reset: () => void;
}

/** True for the durability failures that must fail closed (never transport). */
function isDurabilityFailure(error: unknown): boolean {
  return (
    error instanceof JournalStorageError ||
    error instanceof JournalCorruptError ||
    error instanceof CrossContextLockUnavailableError
  );
}

/**
 * The durable replacement for {@link ../../ui/useMutation.useMutation}, used only by the high-risk
 * inventory writes. Command identity is owned by the owner-bound {@link InventoryJournal}: the key is
 * minted and persisted before transport, kept on an ambiguous failure so a lost-response command is
 * RECOVERABLE after a restart, and pruned only once the operator acknowledges it. Durable persistence
 * is fail-closed — if the journal cannot be secured, the command is blocked and never sent. A monotonic
 * sequence still guards against a stale response from a superseded/abandoned operation settling newer
 * state.
 */
export function useJournaledInventoryMutation<TResult extends object>(options: {
  client: JournaledInventoryClient;
  journal: InventoryJournal;
}): JournaledMutation<TResult> {
  const { client, journal } = options;
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
      // The expected payload identity guards every transition: if the stored entry's identity ever
      // diverged from the command we are running, the transition fails rather than mutating the wrong row.
      const identity = payloadIdentity(payload);
      inFlightRef.current = true;
      dispatch({ type: "submitting" });
      // Mark sent BEFORE transport. If the durable entry disappeared or storage failed, we must NOT
      // transport — the durable record is the only identity we have for an at-most-once replay.
      void journal.markSent(key, identity).then(
        () => {
          runJournaledCommand(client, payload, key).then(
            async (data) => {
              if (seq !== seqRef.current) return; // superseded/abandoned — do not settle
              // Transport already succeeded, so there is no duplication risk if recording the result
              // fails; record best-effort and still surface the canonical success to the operator.
              try {
                await journal.recordAccepted(key, data, identity);
              } catch (error) {
                logJournalIssue("recordAccepted", error);
              }
              inFlightRef.current = false;
              dispatch({ type: "success", data: data as TResult });
            },
            async (error) => {
              if (seq !== seqRef.current) return;
              const classified = classifyCommerceError(error);
              // Only a genuinely AMBIGUOUS outcome (transport/5xx → "retry") may have applied
              // server-side; keep it unresolved so recovery can replay the same key. Every definitive
              // rejection did NOT apply, so the entry is moved to `rejected` (kept until acknowledged),
              // never silently deleted.
              if (describeInventoryWriteError(classified).recovery !== "retry") {
                try {
                  await journal.recordRejected(key, identity);
                } catch (rejectError) {
                  logJournalIssue("recordRejected", rejectError);
                }
              }
              inFlightRef.current = false;
              dispatch({ type: "error", error: classified });
            },
          );
        },
        (error) => {
          // Durable mark-sent failed (entry vanished / storage error): fail closed, never transport.
          logJournalIssue("markSent", error);
          inFlightRef.current = false;
          dispatch({ type: "blocked", reason: "storage-unavailable" });
        },
      );
    },
    [client, journal],
  );

  const submit = useCallback(
    (payload: JournalPayload) => {
      if (inFlightRef.current) return; // duplicate-tap guard
      seqRef.current += 1;
      const seq = seqRef.current;
      inFlightRef.current = true; // hold the guard across the async prepare
      void (async () => {
        try {
          // An equivalent unresolved command already exists: do not mint a second key or send a fresh
          // request — direct the operator to resume it in the recovery panel.
          const equivalent = await journal.findEquivalentUnresolved(payload);
          if (seq !== seqRef.current) return;
          if (equivalent) {
            keyRef.current = equivalent.commandKey;
            payloadRef.current = equivalent.payload;
            inFlightRef.current = false;
            dispatch({ type: "blocked", reason: "pending-equivalent" });
            return;
          }
          const entry = await journal.prepare(payload);
          if (seq !== seqRef.current) {
            inFlightRef.current = false;
            return;
          }
          keyRef.current = entry.commandKey;
          payloadRef.current = entry.payload;
          inFlightRef.current = false;
          run(seq);
        } catch (error) {
          if (seq !== seqRef.current) return;
          // FAIL CLOSED: a durable prepare that could not be secured must never be transported.
          logJournalIssue("prepare", error);
          inFlightRef.current = false;
          dispatch({ type: "blocked", reason: "storage-unavailable" });
          if (!isDurabilityFailure(error)) {
            // Surface unexpected non-durability errors in dev while still failing closed.
            logJournalIssue("prepare-unexpected", error);
          }
        }
      })();
    },
    [journal, run],
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
    const identity = payloadRef.current ? payloadIdentity(payloadRef.current) : undefined;
    keyRef.current = null;
    payloadRef.current = null;
    // A resolved (accepted/rejected) command is pruned on acknowledgement; the journal REFUSES to prune
    // an unresolved command, so an ambiguous command is intentionally left for the recovery surface.
    if (key !== null) {
      void journal
        .acknowledge(key, identity)
        .catch((error) => logJournalIssue("acknowledge", error));
    }
    dispatch({ type: "reset" });
  }, [journal]);

  return { state, submit, retry, reset };
}

/** Technical detail for development only; never surfaced raw to operators. */
function logJournalIssue(stage: string, error: unknown): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(`[inventory-journal] ${stage} failed`, error);
  }
}
