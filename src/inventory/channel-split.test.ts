import { describe, expect, it } from "vitest";

import {
  INVENTORY_LOCATION_A,
  INVENTORY_LOCATION_B,
  VARIANT_A,
  VARIANT_B,
  inventoryItem,
} from "../test-support/fixtures";
import {
  buildAllocationLines,
  buildSplitRows,
  evaluateSplitRow,
  splitTotals,
  type ChannelBalance,
  type SplitRow,
} from "./channel-split";

function balance(overrides: Partial<ChannelBalance> = {}): ChannelBalance {
  return {
    variantId: VARIANT_A,
    canonicalOnHand: 10,
    websiteOnHand: 0,
    websiteReserved: 0,
    websiteAvailable: 0,
    posOnHand: 0,
    posReserved: 0,
    posAvailable: 0,
    unallocatedOnHand: 10,
    mismatch: 0,
    explicitlyAllocated: false,
    balanceVersion: 3,
    allocationVersion: 0,
    ...overrides,
  };
}

function row(overrides: Partial<SplitRow> = {}): SplitRow {
  return {
    variantId: VARIANT_A,
    productName: "Linen Shirt",
    sku: "LS-001-M",
    onHand: 10,
    balanceVersion: 3,
    allocationVersion: 2,
    websiteOnHand: 4,
    posOnHand: 5,
    unallocatedOnHand: 1,
    websiteReserved: 0,
    posReserved: 0,
    mismatch: 0,
    explicitlyAllocated: true,
    ...overrides,
  };
}

describe("buildSplitRows", () => {
  it("joins names and SKU from the same location; versions come from the channel state itself", () => {
    const rows = buildSplitRows(
      [
        balance({ balanceVersion: 7, allocationVersion: 4 }),
        balance({ variantId: VARIANT_B, balanceVersion: 0, allocationVersion: 0 }),
      ],
      [
        inventoryItem({ version: 7 }),
        inventoryItem({
          inventoryLocationId: INVENTORY_LOCATION_B,
          variantId: VARIANT_B,
          version: 99,
        }),
      ],
      INVENTORY_LOCATION_A,
    );
    expect(rows.find((r) => r.variantId === VARIANT_A)).toMatchObject({
      productName: "Linen Shirt",
      balanceVersion: 7,
      allocationVersion: 4,
    });
    // VARIANT_B's inventory row is at another location: fall back to the id; versions from its balance.
    expect(rows.find((r) => r.variantId === VARIANT_B)).toMatchObject({
      productName: VARIANT_B,
      balanceVersion: 0,
      allocationVersion: 0,
    });
  });
});

describe("evaluateSplitRow", () => {
  it("shows the stored split when the row is untouched", () => {
    expect(evaluateSplitRow(row(), undefined)).toEqual({
      website: 4,
      pos: 5,
      unallocated: 1,
      error: null,
      changed: false,
    });
  });

  it("computes the remainder live", () => {
    expect(evaluateSplitRow(row(), { website: "6", pos: "2" })).toMatchObject({
      unallocated: 2,
      error: null,
      changed: true,
    });
  });

  it("rejects non-whole numbers, over-allocation and dropping below reservations", () => {
    expect(evaluateSplitRow(row(), { website: "1.5", pos: "2" }).error).toBe("invalidNumber");
    expect(evaluateSplitRow(row(), { website: "", pos: "2" }).error).toBe("invalidNumber");
    expect(evaluateSplitRow(row(), { website: "6", pos: "5" }).error).toBe("overOnHand");
    expect(evaluateSplitRow(row({ websiteReserved: 3 }), { website: "2", pos: "5" }).error).toBe(
      "belowWebsiteReserved",
    );
    expect(evaluateSplitRow(row({ posReserved: 3 }), { website: "4", pos: "2" }).error).toBe(
      "belowPosReserved",
    );
  });

  it("treats re-saving the same numbers as a change when the item needs a new split", () => {
    expect(evaluateSplitRow(row({ mismatch: -2 }), { website: "4", pos: "5" }).changed).toBe(true);
    expect(evaluateSplitRow(row(), { website: "4", pos: "5" }).changed).toBe(false);
  });
});

describe("buildAllocationLines", () => {
  it("sends only changed rows, with their balance AND allocation versions (no silent overwrite)", () => {
    const rows = [row(), row({ variantId: VARIANT_B, balanceVersion: 8, allocationVersion: 5 })];
    expect(
      buildAllocationLines(rows, {
        [VARIANT_A]: { website: "4", pos: "5" },
        [VARIANT_B]: { website: "1", pos: "2" },
      }),
    ).toEqual([
      {
        variantId: VARIANT_B,
        websiteQuantity: 1,
        posQuantity: 2,
        expectedBalanceVersion: 8,
        expectedAllocationVersion: 5,
      },
    ]);
  });

  it("returns null while any edited row is invalid", () => {
    expect(buildAllocationLines([row()], { [VARIANT_A]: { website: "9", pos: "9" } })).toBeNull();
  });
});

describe("splitTotals", () => {
  it("sums buckets and counts stocked items that were never split", () => {
    expect(
      splitTotals([
        row(),
        row({
          variantId: VARIANT_B,
          explicitlyAllocated: false,
          websiteOnHand: 0,
          posOnHand: 0,
          unallocatedOnHand: 3,
          onHand: 3,
        }),
        row({
          variantId: "x",
          explicitlyAllocated: false,
          onHand: 0,
          websiteOnHand: 0,
          posOnHand: 0,
          unallocatedOnHand: 0,
        }),
      ]),
    ).toEqual({ website: 4, pos: 5, unallocated: 4, notSplit: 1 });
  });
});
