import type { InventoryListQuery, InventoryListResponse } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  INVENTORY_LOCATION_A,
  VARIANT_A,
  VARIANT_B,
  inventoryItem,
  inventoryList,
} from "../test-support/fixtures";
import { MAX_INVENTORY_PAGES, loadAllInventory } from "./load";

describe("loadAllInventory", () => {
  it("returns a single page unchanged and issues exactly one request", async () => {
    const listInventory = vi
      .fn<(query?: InventoryListQuery) => Promise<InventoryListResponse>>()
      .mockResolvedValue(inventoryList([inventoryItem({ variantId: VARIANT_A, onHand: 22 })]));

    const items = await loadAllInventory({ listInventory });

    expect(items).toHaveLength(1);
    expect(items[0].onHand).toBe(22);
    expect(listInventory).toHaveBeenCalledTimes(1);
    // First request carries no cursor.
    expect(listInventory.mock.calls[0][0]).toEqual({ cursor: undefined });
  });

  it("follows the cursor across pages and accumulates every item in order", async () => {
    const listInventory = vi
      .fn<(query?: InventoryListQuery) => Promise<InventoryListResponse>>()
      .mockResolvedValueOnce(
        inventoryList([inventoryItem({ variantId: VARIANT_A, onHand: 22 })], {
          hasMore: true,
          nextCursor: "cursor-1",
        }),
      )
      .mockResolvedValueOnce(
        inventoryList([inventoryItem({ variantId: VARIANT_B, onHand: 39 })], {
          hasMore: false,
          nextCursor: null,
        }),
      );

    const items = await loadAllInventory({ listInventory });

    expect(items.map((i) => i.variantId)).toEqual([VARIANT_A, VARIANT_B]);
    expect(items.map((i) => i.onHand)).toEqual([22, 39]);
    expect(listInventory).toHaveBeenCalledTimes(2);
    // The continuation request replays the server's cursor.
    expect(listInventory.mock.calls[1][0]).toEqual({ cursor: "cursor-1" });
  });

  it("stops as soon as hasMore is false even if a stray nextCursor is present", async () => {
    const listInventory = vi.fn(async () =>
      inventoryList([inventoryItem()], { hasMore: false, nextCursor: "ignored" }),
    );

    const items = await loadAllInventory({ listInventory });

    expect(items).toHaveLength(1);
    expect(listInventory).toHaveBeenCalledTimes(1);
  });

  it("propagates a failure that happens during continuation (no swallow, no partial success)", async () => {
    const listInventory = vi
      .fn<(query?: InventoryListQuery) => Promise<InventoryListResponse>>()
      .mockResolvedValueOnce(
        inventoryList([inventoryItem()], { hasMore: true, nextCursor: "cursor-1" }),
      )
      .mockRejectedValueOnce(new Error("boom"));

    await expect(loadAllInventory({ listInventory })).rejects.toThrow("boom");
    expect(listInventory).toHaveBeenCalledTimes(2);
  });

  it("is bounded: a server that never stops advancing cannot cause an infinite loop", async () => {
    // Always reports another page — a pathological/misbehaving server.
    const listInventory = vi.fn(async () =>
      inventoryList([inventoryItem({ inventoryLocationId: INVENTORY_LOCATION_A })], {
        hasMore: true,
        nextCursor: "always-more",
      }),
    );

    const items = await loadAllInventory({ listInventory });

    expect(listInventory).toHaveBeenCalledTimes(MAX_INVENTORY_PAGES);
    expect(items).toHaveLength(MAX_INVENTORY_PAGES);
  });
});
