import { describe, expect, it } from "vitest";

import { orderDetail } from "../test-support/fixtures";
import {
  fulfillmentByLineNumber,
  fulfillmentQuantityLabel,
  fulfillmentStatusLabel,
} from "./fulfillment";

describe("fulfillmentStatusLabel", () => {
  it("humanises each server status without inventing new ones", () => {
    expect(fulfillmentStatusLabel("unfulfilled")).toBe("Unfulfilled");
    expect(fulfillmentStatusLabel("partially_fulfilled")).toBe("Partially fulfilled");
    expect(fulfillmentStatusLabel("fulfilled")).toBe("Fulfilled");
  });
});

describe("fulfillmentQuantityLabel", () => {
  it("shows a fully fulfilled line as N / N", () => {
    expect(fulfillmentQuantityLabel(3, 3)).toBe("3 / 3 fulfilled");
  });

  it("shows a partially fulfilled line honestly as fulfilled / ordered", () => {
    expect(fulfillmentQuantityLabel(1, 2)).toBe("1 / 2 fulfilled");
  });

  it("shows an unfulfilled line as 0 / N (never rounded up to complete)", () => {
    expect(fulfillmentQuantityLabel(0, 2)).toBe("0 / 2 fulfilled");
  });
});

describe("fulfillmentByLineNumber", () => {
  it("indexes progress lines by lineNumber for pairing with order lines", () => {
    const { fulfillmentProgress } = orderDetail();
    const byLine = fulfillmentByLineNumber(fulfillmentProgress);

    expect(byLine.get(1)?.fulfilledQuantity).toBe(3);
    expect(byLine.get(2)?.fulfilledQuantity).toBe(1);
    // The default fixture is partially fulfilled overall, not complete.
    expect(fulfillmentProgress.status).toBe("partially_fulfilled");
  });
});
