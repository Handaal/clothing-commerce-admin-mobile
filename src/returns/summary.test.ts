import { describe, expect, it } from "vitest";

import { orderReturnSummary } from "../test-support/fixtures";
import { hasReturnActivity, returnedQuantityByLine } from "./summary";

describe("order returns summary helpers", () => {
  it("indexes returned quantities by the order's own line number", () => {
    const map = returnedQuantityByLine(
      orderReturnSummary({
        lines: [
          { orderLineId: "x", lineNumber: 1, returnedQuantity: 2 },
          { orderLineId: "y", lineNumber: 3, returnedQuantity: 1 },
        ],
      }),
    );
    expect(map.get(1)).toBe(2);
    expect(map.get(3)).toBe(1);
    expect(map.get(2)).toBeUndefined();
  });

  it("returns an empty map for an absent summary (no scope / none returned)", () => {
    expect(returnedQuantityByLine(undefined).size).toBe(0);
  });

  it("treats an all-zero summary as no activity, and real refund money as activity", () => {
    expect(hasReturnActivity(undefined)).toBe(false);
    expect(
      hasReturnActivity(
        orderReturnSummary({
          lines: [{ orderLineId: "x", lineNumber: 1, returnedQuantity: 0 }],
          pendingRefundMinor: 0,
          refundedMinor: 0,
        }),
      ),
    ).toBe(false);
    expect(
      hasReturnActivity(
        orderReturnSummary({ lines: [], pendingRefundMinor: 500, refundedMinor: 0 }),
      ),
    ).toBe(true);
  });
});
