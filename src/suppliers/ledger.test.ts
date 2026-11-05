import { describe, expect, it } from "vitest";

import {
  buildPurchaseLines,
  parsePaymentAmount,
  reminderAmountMinor,
  validatePurchaseDraft,
  validateReminderDraft,
  type PurchaseLineDraft,
} from "./ledger";

const VARIANT = "77777777-7777-4777-8777-777777777777";

describe("buildPurchaseLines", () => {
  it("drops rows without a variant and parses quantity + unit cost (major→minor)", () => {
    const drafts: PurchaseLineDraft[] = [
      { variantId: VARIANT, quantity: "20", unitCost: "25.00" },
      { variantId: null, quantity: "5", unitCost: "1.00" },
    ];
    expect(buildPurchaseLines(drafts)).toEqual([
      { variantId: VARIANT, quantity: 20, unitCostMinor: 2500 },
    ]);
  });
});

describe("validatePurchaseDraft", () => {
  const line = { variantId: VARIANT, quantity: 2, unitCostMinor: 2500 };

  it("accepts a valid draft", () => {
    expect(validatePurchaseDraft({ inventoryLocationId: "loc-1", lines: [line] })).toBeNull();
  });
  it("requires a receiving location", () => {
    expect(validatePurchaseDraft({ inventoryLocationId: null, lines: [line] })).not.toBeNull();
  });
  it("requires at least one line", () => {
    expect(validatePurchaseDraft({ inventoryLocationId: "loc-1", lines: [] })).not.toBeNull();
  });
  it("rejects a non-positive quantity", () => {
    expect(
      validatePurchaseDraft({ inventoryLocationId: "loc-1", lines: [{ ...line, quantity: 0 }] }),
    ).not.toBeNull();
  });
  it("rejects a non-positive / NaN unit cost", () => {
    expect(
      validatePurchaseDraft({ inventoryLocationId: "loc-1", lines: [{ ...line, unitCostMinor: Number.NaN }] }),
    ).not.toBeNull();
  });
});

describe("parsePaymentAmount", () => {
  it("parses a major-unit amount to minor", () => {
    expect(parsePaymentAmount("10.50")).toEqual({ ok: true, amountMinor: 1050 });
  });
  it("rejects a blank / invalid amount", () => {
    expect(parsePaymentAmount("").ok).toBe(false);
    expect(parsePaymentAmount("abc").ok).toBe(false);
  });
});

describe("validateReminderDraft", () => {
  it("accepts a valid ISO date", () => {
    expect(validateReminderDraft({ dueDate: "2026-10-01", amount: "", note: "" })).toBeNull();
  });
  it("rejects a malformed date", () => {
    expect(validateReminderDraft({ dueDate: "01/10/2026", amount: "", note: "" })).not.toBeNull();
    expect(validateReminderDraft({ dueDate: "2026-13-40", amount: "", note: "" })).not.toBeNull();
  });
  it("rejects an invalid optional amount", () => {
    expect(validateReminderDraft({ dueDate: "2026-10-01", amount: "abc", note: "" })).not.toBeNull();
  });
});

describe("reminderAmountMinor", () => {
  it("is undefined when blank and parsed when present", () => {
    expect(reminderAmountMinor({ dueDate: "2026-10-01", amount: "", note: "" })).toBeUndefined();
    expect(reminderAmountMinor({ dueDate: "2026-10-01", amount: "30.00", note: "" })).toBe(3000);
  });
});
