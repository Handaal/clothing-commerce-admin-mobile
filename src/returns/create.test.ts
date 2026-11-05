import { describe, expect, it, vi } from "vitest";

import { ORDER_A, ORDER_LINE_A, returnDetail, returnEligibility } from "../test-support/fixtures";
import {
  buildReturnLines,
  canSettleRefund,
  requiresRestockLocation,
  submitCreateReturn,
  submitSettleRefund,
  validateReturnDraft,
  type ReturnLineSelection,
} from "./create";

const SELECTED: ReturnLineSelection = {
  [ORDER_LINE_A]: { quantity: "2", reason: "Wrong size", disposition: "non_restock" },
};

describe("buildReturnLines", () => {
  it("projects only selected lines onto the API shape, parsing quantity", () => {
    const lines = buildReturnLines(returnEligibility(), SELECTED);
    expect(lines).toEqual([
      { orderLineId: ORDER_LINE_A, quantity: 2, reason: "Wrong size", disposition: "non_restock" },
    ]);
  });

  it("drops lines that are not selected", () => {
    expect(buildReturnLines(returnEligibility(), {})).toEqual([]);
  });

  it("trims the reason", () => {
    const lines = buildReturnLines(returnEligibility(), {
      [ORDER_LINE_A]: { quantity: "1", reason: "  damaged  ", disposition: "restock" },
    });
    expect(lines[0].reason).toBe("damaged");
  });
});

describe("requiresRestockLocation", () => {
  it("is true when any line restocks", () => {
    expect(requiresRestockLocation([{ orderLineId: "x", quantity: 1, reason: "r", disposition: "restock" }])).toBe(true);
  });
  it("is false when no line restocks", () => {
    expect(requiresRestockLocation([{ orderLineId: "x", quantity: 1, reason: "r", disposition: "non_restock" }])).toBe(false);
  });
});

describe("validateReturnDraft", () => {
  function draft(selection: ReturnLineSelection, restockLocationId: string | null = null, eligibility = returnEligibility()) {
    return validateReturnDraft({ eligibility, lines: buildReturnLines(eligibility, selection), restockLocationId });
  }

  it("accepts a valid non-restock selection", () => {
    expect(draft(SELECTED)).toBeNull();
  });

  it("rejects when the order is not eligible", () => {
    expect(draft(SELECTED, null, returnEligibility({ eligible: false }))).not.toBeNull();
  });

  it("rejects an empty selection", () => {
    expect(draft({})).not.toBeNull();
  });

  it("rejects a non-positive quantity", () => {
    expect(draft({ [ORDER_LINE_A]: { quantity: "0", reason: "r", disposition: "non_restock" } })).not.toBeNull();
  });

  it("rejects a quantity beyond the eligible remaining quantity", () => {
    expect(draft({ [ORDER_LINE_A]: { quantity: "99", reason: "r", disposition: "non_restock" } })).not.toBeNull();
  });

  it("rejects a missing reason", () => {
    expect(draft({ [ORDER_LINE_A]: { quantity: "1", reason: "  ", disposition: "non_restock" } })).not.toBeNull();
  });

  it("rejects a reason outside the policy's allowed set", () => {
    const eligibility = returnEligibility({
      policy: { windowDays: 30, allowedReasons: ["Damaged"], manualRefundsEnabled: true, maxManualRefundMinor: null },
    });
    expect(draft({ [ORDER_LINE_A]: { quantity: "1", reason: "Other", disposition: "non_restock" } }, null, eligibility)).not.toBeNull();
    expect(draft({ [ORDER_LINE_A]: { quantity: "1", reason: "Damaged", disposition: "non_restock" } }, null, eligibility)).toBeNull();
  });

  it("requires a receiving location when a line restocks", () => {
    const restocking: ReturnLineSelection = {
      [ORDER_LINE_A]: { quantity: "1", reason: "r", disposition: "restock" },
    };
    expect(draft(restocking, null)).not.toBeNull();
    expect(draft(restocking, "loc-1")).toBeNull();
  });
});

describe("submitCreateReturn", () => {
  it("creates a pending-refund return, forwarding the idempotency key", async () => {
    const createReturn = vi.fn().mockResolvedValue(returnDetail());
    await submitCreateReturn(
      { createReturn },
      {
        orderId: ORDER_A,
        lines: [{ orderLineId: ORDER_LINE_A, quantity: 1, reason: "Wrong size", disposition: "restock" }],
        inventoryLocationId: "loc-1",
      },
      "idem-key-1",
    );
    expect(createReturn).toHaveBeenCalledWith({
      orderId: ORDER_A,
      idempotencyKey: "idem-key-1",
      lines: [{ orderLineId: ORDER_LINE_A, quantity: 1, reason: "Wrong size", disposition: "restock" }],
      inventoryLocationId: "loc-1",
      refundMode: "pending",
      settlementReference: null,
    });
  });
});

describe("submitSettleRefund", () => {
  it("settles with the reference and idempotency key", async () => {
    const settleRefund = vi.fn().mockResolvedValue(returnDetail());
    await submitSettleRefund(
      { settleRefund },
      { returnId: "ret-1", settlementReference: "till-1" },
      "idem-key-2",
    );
    expect(settleRefund).toHaveBeenCalledWith({
      returnId: "ret-1",
      idempotencyKey: "idem-key-2",
      settlementReference: "till-1",
    });
  });
});

describe("canSettleRefund", () => {
  it("allows a pending non-electronic refund", () => {
    expect(canSettleRefund(returnDetail({ refund: { ...returnDetail().refund, status: "pending", method: "cash" } }).refund)).toBe(true);
  });
  it("blocks an electronic refund", () => {
    expect(canSettleRefund(returnDetail({ refund: { ...returnDetail().refund, status: "pending", method: "electronic" } }).refund)).toBe(false);
  });
  it("blocks an already-succeeded refund", () => {
    expect(canSettleRefund(returnDetail({ refund: { ...returnDetail().refund, status: "succeeded", method: "cash" } }).refund)).toBe(false);
  });
});
