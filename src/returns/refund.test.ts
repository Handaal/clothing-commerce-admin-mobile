import { describe, expect, it } from "vitest";

import {
  dispositionLabel,
  dispositionSummary,
  refundMethodLabel,
  refundStatusDetail,
  refundStatusLabel,
  returnChannelLabel,
  returnSourceLabel,
} from "./refund";

describe("refund display helpers", () => {
  it("labels each exact refund state and never dresses pending as settled", () => {
    expect(refundStatusLabel("pending")).toBe("Refund pending");
    expect(refundStatusLabel("succeeded")).toBe("Refund succeeded");
    expect(refundStatusLabel("failed")).toBe("Refund failed");
    expect(refundStatusLabel("pending")).not.toContain("succeeded");
    expect(refundStatusDetail("pending")).toMatch(/not been recorded as paid/i);
    expect(refundStatusDetail("failed")).toMatch(/remains reserved/i);
  });

  it("labels refund methods consistently with the payment surface", () => {
    expect(refundMethodLabel("cash")).toBe("Cash");
    expect(refundMethodLabel("cash_on_delivery")).toBe("Cash on delivery");
    expect(refundMethodLabel("electronic")).toBe("Electronic");
  });

  it("explains the operational effect of each disposition", () => {
    expect(dispositionLabel("restock")).toBe("Restocked");
    expect(dispositionLabel("non_restock")).toMatch(/damaged \/ write-off/);
  });

  it("summarizes mixed, restock-only and write-off-only dispositions", () => {
    expect(dispositionSummary([{ disposition: "restock" }])).toBe("Restocked");
    expect(dispositionSummary([{ disposition: "non_restock" }])).toBe("Write-off");
    expect(dispositionSummary([{ disposition: "restock" }, { disposition: "non_restock" }])).toBe(
      "Restocked · write-off",
    );
    expect(dispositionSummary([])).toBe("—");
  });

  it("labels source as audit metadata and channel as an uppercase badge", () => {
    expect(returnSourceLabel("admin-mobile")).toBe("Admin mobile");
    expect(returnSourceLabel("pos")).toBe("POS");
    expect(returnSourceLabel("management")).toBe("Management");
    expect(returnChannelLabel("online")).toBe("ONLINE");
    expect(returnChannelLabel("pos")).toBe("POS");
  });
});
