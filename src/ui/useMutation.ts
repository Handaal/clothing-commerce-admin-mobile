import { useCallback, useEffect, useReducer, useRef } from "react";

import { classifyCommerceError, type ClassifiedCommerceError } from "../commerce/errors";
import type { IdempotencyKeyFactory } from "../inventory/idempotency";

export type MutationState<T> =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; data: T }
  | { status: "error"; error: ClassifiedCommerceError };

type MutationAction<T> =
  | { type: "submitting" }
  | { type: "success"; data: T }
  | { type: "error"; error: ClassifiedCommerceError }
  | { type: "reset" };

function reducer<T>(_state: MutationState<T>, action: MutationAction<T>): MutationState<T> {
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

export interface Mutation<TArgs, TResult> {
  state: MutationState<TResult>;
  /**
   * Begin a NEW logical operation: mints a fresh idempotency key, records the args, and runs. Ignored
   * while a request is already in flight (the duplicate-tap guard), so a double press cannot fire two
   * writes.
   */
  submit: (args: TArgs) => void;
  /**
   * Re-run the SAME operation after an ambiguous failure. Reuses the identical idempotency key and
   * args — it NEVER regenerates the key — so a request that may already have been applied is not
   * applied twice. No-op while a request is in flight.
   */
  retry: () => void;
  /**
   * Abandon the current operation and return to idle. The next {@link submit} is a genuinely new
   * operation with a new key. Invalidates any in-flight response so a late result from the abandoned
   * operation can never overwrite the reset (idle) state.
   */
  reset: () => void;
}

/**
 * A small, explicit write-lifecycle hook for inventory mutations — intentionally NOT the read-oriented
 * `useAsync`. It owns exactly four states (idle · submitting · success · error) and the idempotency-key
 * lifecycle:
 *
 * - NEW operation → mint key K, submit K.
 * - ambiguous failure → retry reuses the SAME K (at-most-once at the API).
 * - reset / next submit → mint a fresh K.
 *
 * A monotonic sequence guards against stale results: only the response whose sequence still matches the
 * current operation is allowed to settle state, so a slow response from an abandoned/retried operation
 * cannot clobber a newer one. This is not a generic mutation framework — it is the one lifecycle the
 * three inventory writes share.
 */
/**
 * Optional side-effects fired exactly once per settled operation, after state is dispatched. Intended
 * for transient UX feedback (e.g. a success/failure toast) — never for the authoritative result,
 * which lives in {@link MutationState}. Stale/superseded responses never fire these.
 */
export interface MutationCallbacks<TResult> {
  onSuccess?: (data: TResult) => void;
  onError?: (error: ClassifiedCommerceError) => void;
}

export function useMutation<TArgs, TResult>(
  producer: (args: TArgs, idempotencyKey: string) => Promise<TResult>,
  generateKey: IdempotencyKeyFactory,
  callbacks?: MutationCallbacks<TResult>,
): Mutation<TArgs, TResult> {
  const [state, dispatch] = useReducer(reducer<TResult>, { status: "idle" });
  // Latest callbacks held in a ref so firing them never depends on referential stability at the call
  // site (a form can pass fresh closures each render without re-running the producer). Synced in an
  // effect — never during render — and read only when a settled response fires, which is always after
  // commit, so the one-render lag is immaterial.
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });
  // Current operation's idempotency key and args. Held in refs (not state) so they survive rerenders
  // without being regenerated and are never recomputed during render.
  const keyRef = useRef<string | null>(null);
  const argsRef = useRef<TArgs | null>(null);
  // Monotonic operation sequence; bumped when a new operation starts or the operation is reset.
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);

  const run = useCallback(
    (seq: number) => {
      inFlightRef.current = true;
      dispatch({ type: "submitting" });
      // key/args are always set by submit()/retry() before run() is called.
      const key = keyRef.current as string;
      const args = argsRef.current as TArgs;
      producer(args, key).then(
        (data) => {
          if (seq !== seqRef.current) return; // stale: operation was reset/superseded
          inFlightRef.current = false;
          dispatch({ type: "success", data });
          callbacksRef.current?.onSuccess?.(data);
        },
        (error) => {
          if (seq !== seqRef.current) return; // stale: operation was reset/superseded
          inFlightRef.current = false;
          const classified = classifyCommerceError(error);
          dispatch({ type: "error", error: classified });
          callbacksRef.current?.onError?.(classified);
        },
      );
    },
    [producer],
  );

  const submit = useCallback(
    (args: TArgs) => {
      if (inFlightRef.current) return; // duplicate-tap guard
      seqRef.current += 1; // new operation supersedes any prior in-flight response
      keyRef.current = generateKey(); // fresh key per NEW operation — never on render, never on retry
      argsRef.current = args;
      run(seqRef.current);
    },
    [generateKey, run],
  );

  const retry = useCallback(() => {
    if (inFlightRef.current) return;
    if (keyRef.current === null || argsRef.current === null) return;
    // Same operation: reuse the existing key + args and keep the sequence, so this retry's response is
    // still accepted. The key is deliberately NOT regenerated.
    run(seqRef.current);
  }, [run]);

  const reset = useCallback(() => {
    seqRef.current += 1; // invalidate any in-flight response from the abandoned operation
    inFlightRef.current = false;
    keyRef.current = null;
    argsRef.current = null;
    dispatch({ type: "reset" });
  }, []);

  return { state, submit, retry, reset };
}
