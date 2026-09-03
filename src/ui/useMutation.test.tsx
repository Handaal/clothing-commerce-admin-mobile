// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useMutation } from "./useMutation";

// Settle a parked producer promise and flush the resulting state update (a microtask) inside act.
async function settle(fn: () => void) {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
}

// A controllable producer: each call parks a deferred so the test drives resolution/rejection and can
// assert the args + idempotency key it was invoked with.
function deferredProducer<TArgs, TResult>() {
  const calls: {
    args: TArgs;
    key: string;
    resolve: (v: TResult) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const producer = vi.fn((args: TArgs, key: string) => {
    return new Promise<TResult>((resolve, reject) => {
      calls.push({ args, key, resolve, reject });
    });
  });
  return { producer, calls };
}

function keyFactory(...keys: string[]) {
  let i = 0;
  return vi.fn(() => keys[i++] ?? `overflow-${i}`);
}

describe("useMutation", () => {
  it("mints a fresh key on a new operation and passes it to the producer", async () => {
    const { producer, calls } = deferredProducer<{ q: number }, string>();
    const gen = keyFactory("K1");
    const { result } = renderHook(() => useMutation(producer, gen));

    expect(result.current.state.status).toBe("idle");
    act(() => result.current.submit({ q: 5 }));

    expect(result.current.state.status).toBe("submitting");
    expect(gen).toHaveBeenCalledTimes(1);
    expect(calls[0].key).toBe("K1");
    expect(calls[0].args).toEqual({ q: 5 });

    await settle(() => calls[0].resolve("ok"));
    expect(result.current.state).toEqual({ status: "success", data: "ok" });
  });

  it("blocks duplicate taps while a submit is in flight", () => {
    const { producer } = deferredProducer<{ q: number }, string>();
    const gen = keyFactory("K1", "K2");
    const { result } = renderHook(() => useMutation(producer, gen));

    act(() => result.current.submit({ q: 1 }));
    act(() => result.current.submit({ q: 1 })); // ignored — request already in flight

    expect(producer).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it("retry reuses the SAME idempotency key and never regenerates it", async () => {
    const { producer, calls } = deferredProducer<{ q: number }, string>();
    const gen = keyFactory("K1", "K2");
    const { result } = renderHook(() => useMutation(producer, gen));

    act(() => result.current.submit({ q: 2 }));
    await settle(() => calls[0].reject(new ApiNetworkError("down")));
    expect(result.current.state.status).toBe("error");

    act(() => result.current.retry());
    expect(producer).toHaveBeenCalledTimes(2);
    expect(calls[1].key).toBe("K1"); // reused
    expect(gen).toHaveBeenCalledTimes(1); // no new key minted on retry

    await settle(() => calls[1].resolve("done"));
    expect(result.current.state).toEqual({ status: "success", data: "done" });
  });

  it("mints a NEW key for the next operation after reset", async () => {
    const { producer, calls } = deferredProducer<{ q: number }, string>();
    const gen = keyFactory("K1", "K2");
    const { result } = renderHook(() => useMutation(producer, gen));

    act(() => result.current.submit({ q: 1 }));
    await settle(() => calls[0].resolve("first"));
    act(() => result.current.reset());
    expect(result.current.state.status).toBe("idle");

    act(() => result.current.submit({ q: 9 }));
    expect(calls[1].key).toBe("K2");
    expect(calls[1].args).toEqual({ q: 9 });
  });

  it("mints a new key when a fresh operation follows a success (no reset needed)", async () => {
    const { producer, calls } = deferredProducer<{ q: number }, string>();
    const gen = keyFactory("K1", "K2");
    const { result } = renderHook(() => useMutation(producer, gen));

    act(() => result.current.submit({ q: 1 }));
    await settle(() => calls[0].resolve("first"));
    act(() => result.current.submit({ q: 2 }));

    expect(calls[1].key).toBe("K2");
  });

  it("does not let a stale result from a reset operation overwrite the new state", async () => {
    const { producer, calls } = deferredProducer<{ q: number }, string>();
    const gen = keyFactory("K1", "K2");
    const { result } = renderHook(() => useMutation(producer, gen));

    act(() => result.current.submit({ q: 1 })); // op1 in flight
    act(() => result.current.reset()); // abandon op1
    // op1's late response arrives AFTER reset — it must be ignored.
    await settle(() => calls[0].resolve("stale"));
    expect(result.current.state.status).toBe("idle");
  });

  it("classifies a rejection into the shared Commerce error shape", async () => {
    const { producer, calls } = deferredProducer<{ q: number }, string>();
    const gen = keyFactory("K1");
    const { result } = renderHook(() => useMutation(producer, gen));

    act(() => result.current.submit({ q: 1 }));
    await settle(() => calls[0].reject(new ApiHttpError("no", 403, "FORBIDDEN", null)));

    expect(result.current.state).toMatchObject({
      status: "error",
      error: { kind: "forbidden", status: 403 },
    });
  });
});
