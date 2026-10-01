// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { receiveResponse } from "../../test-support/fixtures";
import { installWebLocks, removeWebLocks } from "../../test-support/web-locks";
import { createInventoryJournal } from "./journal";
import { JournalStorageError, normalizeReceivePayload, type JournalOwner } from "./model";
import { createMemoryJournalStore, type JournalStore } from "./store";
import { useJournaledInventoryMutation } from "./useJournaledInventoryMutation";

// The hook performs high-risk journal mutations, which require cross-context locking: model a supported
// browser (Web Locks present) for these tests.
beforeEach(() => installWebLocks());
afterEach(() => removeWebLocks());

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OWNER: JournalOwner = { tenantId: TENANT, membershipId: MEMBER };
const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

const payload = normalizeReceivePayload({
  variantId: VARIANT,
  inventoryLocationId: LOCATION,
  quantity: 5,
});

describe("useJournaledInventoryMutation", () => {
  it("persists the command (prepared then sent) to the journal BEFORE transport", async () => {
    const events: string[] = [];
    const backing = createMemoryJournalStore();
    const store: JournalStore = {
      read: backing.read,
      write: async (document) => {
        events.push(`write:${document.entries.map((e) => e.status).join("|") || "empty"}`);
        await backing.write(document);
      },
    };
    const journal = createInventoryJournal(store, OWNER, keyFactory("K1"));
    const receiveInventory = vi.fn(async () => {
      events.push("transport");
      return receiveResponse();
    });
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };

    const { result } = renderHook(() => useJournaledInventoryMutation({ client, journal }));
    act(() => result.current.submit(payload));
    await waitFor(() => expect(result.current.state.status).toBe("success"));

    // The durable writes for prepared and sent both precede the transport call.
    expect(events).toEqual(["write:prepared", "write:sent", "transport", "write:accepted"]);
    expect(receiveInventory).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "K1", quantity: 5 }),
    );
  });

  it("keeps the command unresolved after an ambiguous failure (recoverable)", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER, keyFactory("K1"));
    const receiveInventory = vi.fn().mockRejectedValue(new ApiNetworkError("down"));
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };

    const { result } = renderHook(() => useJournaledInventoryMutation({ client, journal }));
    act(() => result.current.submit(payload));
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    const recoverable = await journal.findRecoverable();
    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]?.commandKey).toBe("K1"); // still there for recovery, same key
    expect(recoverable[0]?.status).toBe("sent");
  });

  it("records a definitive rejection as resolved (rejected), kept until acknowledged", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER, keyFactory("K1"));
    const receiveInventory = vi
      .fn()
      .mockRejectedValue(new ApiHttpError("insufficient", 409, "INSUFFICIENT_STOCK", null));
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };

    const { result } = renderHook(() => useJournaledInventoryMutation({ client, journal }));
    act(() => result.current.submit(payload));
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    const recoverable = await journal.findRecoverable();
    expect(recoverable).toHaveLength(1);
    expect(recoverable[0]?.status).toBe("rejected");
  });

  it("FAILS CLOSED when durable prepare throws — the API is never called (P1-2)", async () => {
    // A store whose write always fails models a quota/disabled durable backend.
    const store: JournalStore = {
      read: createMemoryJournalStore().read,
      write: async () => {
        throw new JournalStorageError("quota");
      },
    };
    const journal = createInventoryJournal(store, OWNER, keyFactory("K1"));
    const receiveInventory = vi.fn();
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };

    const { result } = renderHook(() => useJournaledInventoryMutation({ client, journal }));
    act(() => result.current.submit(payload));
    await waitFor(() => expect(result.current.state.status).toBe("blocked"));
    expect(result.current.state).toMatchObject({
      status: "blocked",
      reason: "storage-unavailable",
    });
    expect(receiveInventory).not.toHaveBeenCalled(); // ZERO API requests
  });

  it("blocks an equivalent submission and never mints a second key, directing to recovery (P1 equivalent-intent)", async () => {
    const journal = createInventoryJournal(
      createMemoryJournalStore(),
      OWNER,
      keyFactory("K1", "K2"),
    );
    // Leave an unresolved command (as after an ambiguous send).
    await journal.prepare(payload);

    const receiveInventory = vi.fn();
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };
    const { result } = renderHook(() => useJournaledInventoryMutation({ client, journal }));
    act(() => result.current.submit(payload));
    await waitFor(() => expect(result.current.state.status).toBe("blocked"));
    expect(result.current.state).toMatchObject({ status: "blocked", reason: "pending-equivalent" });
    expect(receiveInventory).not.toHaveBeenCalled();
    // No second key was minted — still exactly one unresolved command.
    expect(await journal.findRecoverable()).toHaveLength(1);
  });

  it("reuses the same key on retry and prunes on reset (acknowledge) after success", async () => {
    const journal = createInventoryJournal(
      createMemoryJournalStore(),
      OWNER,
      keyFactory("K1", "K2"),
    );
    const receiveInventory = vi
      .fn()
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(receiveResponse());
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };

    const { result } = renderHook(() => useJournaledInventoryMutation({ client, journal }));
    act(() => result.current.submit(payload));
    await waitFor(() => expect(result.current.state.status).toBe("error"));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("success"));

    expect(receiveInventory).toHaveBeenCalledTimes(2);
    expect(receiveInventory.mock.calls[0]?.[0].idempotencyKey).toBe("K1");
    expect(receiveInventory.mock.calls[1]?.[0].idempotencyKey).toBe("K1"); // reused, not re-minted

    act(() => result.current.reset());
    await waitFor(async () => expect(await journal.get("K1")).toBeNull());
  });
});
