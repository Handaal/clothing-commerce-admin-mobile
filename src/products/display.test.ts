import { describe, expect, it } from "vitest";

import { formatMoneyMinor } from "./display";

describe("formatMoneyMinor", () => {
  it("groups thousands like the Storefront and POS", () => {
    expect(formatMoneyMinor(1219970, "EGP")).toBe("EGP 12,199.70");
    expect(formatMoneyMinor(123456789, "EGP")).toBe("EGP 1,234,567.89");
    expect(formatMoneyMinor(69800, "EGP")).toBe("EGP 698.00");
    expect(formatMoneyMinor(0, "EGP")).toBe("EGP 0.00");
    expect(formatMoneyMinor(-150000, "EGP")).toBe("EGP -1,500.00");
  });
});
