import { describe, expect, it } from "vitest";

import {
  isUnresolved,
  normalizeAdjustPayload,
  normalizeReceivePayload,
  normalizeTransferPayload,
  payloadIdentity,
} from "./model";

const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOCATION_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SUPPLIER = "a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5";

describe("journal payload normalization", () => {
  it("drops a blank note so 'no note' and 'whitespace note' are the same command", () => {
    const a = normalizeReceivePayload({
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 2,
    });
    const b = normalizeReceivePayload({
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 2,
      note: "   ",
    });
    expect(a).not.toHaveProperty("note");
    expect(payloadIdentity(a)).toBe(payloadIdentity(b));
  });

  it("keeps a supplier reference only alongside a supplier", () => {
    const linked = normalizeReceivePayload({
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 2,
      supplierId: SUPPLIER,
      supplierReference: "GRN-1",
    });
    expect(linked).toMatchObject({ supplierId: SUPPLIER, supplierReference: "GRN-1" });

    // A reference without a supplier is dropped entirely (a legacy no-supplier receipt).
    const unlinked = normalizeReceivePayload({
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 2,
      supplierReference: "GRN-1",
    });
    expect(unlinked).not.toHaveProperty("supplierId");
    expect(unlinked).not.toHaveProperty("supplierReference");
  });

  it("gives a stable identity independent of key order but sensitive to real differences", () => {
    const receive = normalizeReceivePayload({
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 2,
      note: "restock",
    });
    // Same command, keys shuffled → identical identity.
    const shuffled = normalizeReceivePayload({
      quantity: 2,
      note: "restock",
      inventoryLocationId: LOCATION,
      variantId: VARIANT,
    });
    expect(payloadIdentity(receive)).toBe(payloadIdentity(shuffled));

    // A different quantity is a genuinely different command.
    const more = normalizeReceivePayload({
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      quantity: 3,
    });
    expect(payloadIdentity(receive)).not.toBe(payloadIdentity(more));
  });

  it("treats a recount against a new version as a new adjust command", () => {
    const v2 = normalizeAdjustPayload({
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      countedQuantity: 10,
      expectedVersion: 2,
    });
    const v3 = normalizeAdjustPayload({
      variantId: VARIANT,
      inventoryLocationId: LOCATION,
      countedQuantity: 10,
      expectedVersion: 3,
    });
    expect(payloadIdentity(v2)).not.toBe(payloadIdentity(v3));
  });

  it("distinguishes transfer direction", () => {
    const forward = normalizeTransferPayload({
      variantId: VARIANT,
      sourceInventoryLocationId: LOCATION,
      destinationInventoryLocationId: LOCATION_B,
      quantity: 1,
    });
    const reverse = normalizeTransferPayload({
      variantId: VARIANT,
      sourceInventoryLocationId: LOCATION_B,
      destinationInventoryLocationId: LOCATION,
      quantity: 1,
    });
    expect(payloadIdentity(forward)).not.toBe(payloadIdentity(reverse));
  });

  it("classifies which lifecycle states are unresolved", () => {
    expect(isUnresolved("prepared")).toBe(true);
    expect(isUnresolved("sent")).toBe(true);
    expect(isUnresolved("accepted")).toBe(false);
    expect(isUnresolved("acknowledged")).toBe(false);
  });
});
