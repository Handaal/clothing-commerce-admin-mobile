import { describe, expect, it, vi } from "vitest";

import { inventoryItem } from "../test-support/fixtures";
import {
  adjustStock,
  distinctVariants,
  receiveStock,
  rowKey,
  transferStock,
  validateCountedQuantity,
  validatePositiveQuantity,
  validateTransferLocations,
} from "./operations";

const VARIANT = "77777777-7777-4777-8777-777777777777";
const VARIANT_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOC_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

describe("inventory write producers", () => {
  it("receiveStock sends the business fields plus the idempotency key, unchanged", async () => {
    const receiveInventory = vi.fn().mockResolvedValue({ operationId: "op" });
    await receiveStock(
      { receiveInventory },
      { variantId: VARIANT, inventoryLocationId: LOC_A, quantity: 4, note: "restock" },
      "key-1",
    );
    expect(receiveInventory).toHaveBeenCalledWith({
      variantId: VARIANT,
      inventoryLocationId: LOC_A,
      quantity: 4,
      note: "restock",
      idempotencyKey: "key-1",
    });
  });

  it("adjustStock forwards countedQuantity and expectedVersion for optimistic concurrency", async () => {
    const adjustInventory = vi.fn().mockResolvedValue({ operationId: "op" });
    await adjustStock(
      { adjustInventory },
      { variantId: VARIANT, inventoryLocationId: LOC_A, countedQuantity: 30, expectedVersion: 2 },
      "key-2",
    );
    expect(adjustInventory).toHaveBeenCalledWith({
      variantId: VARIANT,
      inventoryLocationId: LOC_A,
      countedQuantity: 30,
      expectedVersion: 2,
      idempotencyKey: "key-2",
    });
  });

  it("transferStock forwards source, destination, variant and quantity", async () => {
    const transferInventory = vi.fn().mockResolvedValue({ operationId: "op" });
    await transferStock(
      { transferInventory },
      {
        variantId: VARIANT,
        sourceInventoryLocationId: LOC_A,
        destinationInventoryLocationId: LOC_B,
        quantity: 3,
      },
      "key-3",
    );
    expect(transferInventory).toHaveBeenCalledWith({
      variantId: VARIANT,
      sourceInventoryLocationId: LOC_A,
      destinationInventoryLocationId: LOC_B,
      quantity: 3,
      idempotencyKey: "key-3",
    });
  });
});

describe("distinctVariants", () => {
  it("returns each variant once in first-seen order from real inventory rows", () => {
    const variants = distinctVariants([
      inventoryItem({ variantId: VARIANT, productName: "Linen Shirt", sku: "LS-M" }),
      inventoryItem({ variantId: VARIANT, inventoryLocationId: LOC_B }), // same variant, other location
      inventoryItem({ variantId: VARIANT_2, productName: "Canvas Tote", sku: "CT-1" }),
    ]);
    expect(variants).toEqual([
      { variantId: VARIANT, productName: "Linen Shirt", sku: "LS-M" },
      { variantId: VARIANT_2, productName: "Canvas Tote", sku: "CT-1" },
    ]);
  });
});

describe("local validation (UX only; API stays authoritative)", () => {
  it("requires receive/transfer quantity to be a positive whole number", () => {
    expect(validatePositiveQuantity(5)).toBeNull();
    expect(validatePositiveQuantity(0)).not.toBeNull();
    expect(validatePositiveQuantity(-2)).not.toBeNull();
    expect(validatePositiveQuantity(1.5)).not.toBeNull();
    expect(validatePositiveQuantity(Number.NaN)).not.toBeNull();
  });

  it("allows a counted quantity of zero but rejects negatives and fractions", () => {
    expect(validateCountedQuantity(0)).toBeNull();
    expect(validateCountedQuantity(12)).toBeNull();
    expect(validateCountedQuantity(-1)).not.toBeNull();
    expect(validateCountedQuantity(2.3)).not.toBeNull();
  });

  it("rejects a transfer whose source equals its destination", () => {
    expect(validateTransferLocations(LOC_A, LOC_B)).toBeNull();
    expect(validateTransferLocations(LOC_A, LOC_A)).not.toBeNull();
    expect(validateTransferLocations("", "")).toBeNull(); // nothing selected yet: no objection
  });
});

describe("rowKey", () => {
  it("is a stable location×variant identity", () => {
    expect(rowKey(LOC_A, VARIANT)).toBe(`${LOC_A}:${VARIANT}`);
  });
});
