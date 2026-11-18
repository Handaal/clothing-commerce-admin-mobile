import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { classifyCommerceError, type ClassifiedCommerceError } from "../commerce/errors";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: ClassifiedCommerceError };

type AsyncAction<T> =
  | { type: "reset" }
  | { type: "success"; data: T }
  | { type: "error"; error: ClassifiedCommerceError };

/**
 * Runs an async producer and exposes loading / success / classified-error, plus a stable `reload`
 * for retry. Failures are surfaced through the shared Commerce classifier — they are NEVER turned
 * into an empty or fake-success state, and there is no mock-data fallback.
 *
 * State transitions go through a reducer (never a bare setState in the effect), mirroring the
 * SessionProvider's lifecycle model. The caller MUST pass a referentially stable `producer` (e.g. a
 * `useCallback` keyed on the tenant-scoped client and any path params) so the fetch runs once per
 * real input change and on explicit retry — never on every render.
 */
export function useAsync<T>(producer: () => Promise<T>): {
  state: AsyncState<T>;
  reload: () => void;
  /** User-initiated refresh (keeps current content visible, spins the pull-to-refresh control). */
  refresh: () => void;
  /** True only while a `refresh()` is in flight — never during the initial load. */
  refreshing: boolean;
} {
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [state, dispatch] = useReducer(
    (_state: AsyncState<T>, action: AsyncAction<T>): AsyncState<T> => {
      switch (action.type) {
        case "reset":
          return { status: "loading" };
        case "success":
          return { status: "success", data: action.data };
        case "error":
          return { status: "error", error: action.error };
      }
    },
    { status: "loading" },
  );

  const refreshingRef = useRef(false);
  useEffect(() => {
    let active = true;
    // A user-initiated refresh keeps the current content on screen; only a cold load resets to the
    // skeleton/spinner state.
    if (!refreshingRef.current) dispatch({ type: "reset" });
    const settle = () => {
      if (!active) return;
      refreshingRef.current = false;
      setRefreshing(false);
    };
    producer().then(
      (data) => {
        if (active) dispatch({ type: "success", data });
        settle();
      },
      (error) => {
        if (active) dispatch({ type: "error", error: classifyCommerceError(error) });
        settle();
      },
    );
    return () => {
      active = false;
    };
  }, [producer, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const refresh = useCallback(() => {
    refreshingRef.current = true;
    setRefreshing(true);
    setAttempt((n) => n + 1);
  }, []);

  return { state, reload, refresh, refreshing };
}
