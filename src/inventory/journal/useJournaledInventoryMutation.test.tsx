// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { receiveResponse } from "../../test-support/fixtures";
import { createInventoryJournal } from "./journal";
import { normalizeReceivePayload } from "./model";
import { createMemoryJournalStore, type JournalStore } from "./store";
import { useJournaledInventoryMutation } from "./useJournaledInventoryMutation";

const TENANT = "11111111-1111-4111-8111-111111111111";
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
    const journal = createInventoryJournal(store, keyFactory("K1"));
    const receiveInventory = vi.fn(async () => {
      events.push("transport");
      return receiveResponse();
    });
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };

    const { result } = renderHook(() =>
      useJournaledInventoryMutation({ client, journal, tenantId: TENANT }),
    );
    act(() => result.current.submit(payload));
    await waitFor(() => expect(result.current.state.status).toBe("success"));

    // The durable writes for prepared and sent both precede the transport call.
    expect(events).toEqual(["write:prepared", "write:sent", "transport", "write:accepted"]);
    expect(receiveInventory).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "K1", quantity: 5 }),
    );
  });

  it("keeps the command unresolved after an ambiguous failure (recoverable)", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1"));
    const receiveInventory = vi.fn().mockRejectedValue(new ApiNetworkError("down"));
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };

    const { result } = renderHook(() =>
      useJournaledInventoryMutation({ client, journal, tenantId: TENANT }),
    );
    act(() => result.current.submit(payload));
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    const unresolved = await journal.findUnresolved(TENANT);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.commandKey).toBe("K1"); // still there for recovery, same key
  });

  it("discards the command after a definitive rejection that never applied", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1"));
    const receiveInventory = vi
      .fn()
      .mockRejectedValue(new ApiHttpError("insufficient", 409, "INSUFFICIENT_STOCK", null));
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };

    const { result } = renderHook(() =>
      useJournaledInventoryMutation({ client, journal, tenantId: TENANT }),
    );
    act(() => result.current.submit(payload));
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    expect(await journal.findUnresolved(TENANT)).toHaveLength(0);
  });

  it("reuses the same key on retry and prunes on reset after success", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1", "K2"));
    const receiveInventory = vi
      .fn()
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(receiveResponse());
    const client = { receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() };

    const { result } = renderHook(() =>
      useJournaledInventoryMutation({ client, journal, tenantId: TENANT }),
    );
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
