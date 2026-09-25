import { describe, expect, it } from "vitest";

import { promotionDetail, promotionSummary } from "../test-support/fixtures";
import {
  benefitLabel,
  promotionEffectiveState,
  promotionSummaryState,
  usageLabel,
} from "./display";

describe("Promotion display semantics", () => {
  it("derives scheduled, expired, exhausted, active and inactive without inventing lifecycle values", () => {
    const now = new Date("2026-09-25T12:00:00.000Z");
    expect(
      promotionEffectiveState(
        promotionDetail({ economicsLocked: false, startsAt: "2026-10-01T00:00:00.000Z" }),
        now,
      ),
    ).toBe("scheduled");
    expect(
      promotionEffectiveState(
        promotionDetail({ economicsLocked: false, endsAt: "2026-09-01T00:00:00.000Z" }),
        now,
      ),
    ).toBe("expired");
    expect(
      promotionEffectiveState(
        promotionDetail({ economicsLocked: false, remainingRedemptions: 0 }),
        now,
      ),
    ).toBe("exhausted");
    expect(promotionEffectiveState(promotionDetail({ status: "inactive" }), now)).toBe("inactive");
    expect(
      promotionEffectiveState(
        promotionDetail({ economicsLocked: false, remainingRedemptions: null }),
        now,
      ),
    ).toBe("active");
  });

  it("renders percentage/fixed benefits and usage from canonical values", () => {
    expect(benefitLabel(promotionDetail({ benefitPercentBp: 1250 }))).toBe("12.5% off");
    expect(
      benefitLabel(
        promotionDetail({
          benefitType: "fixed_amount",
          benefitPercentBp: null,
          benefitAmountMinor: 2599,
          benefitCurrency: "USD",
        }),
      ),
    ).toBe("USD 25.99 off");
    expect(usageLabel(2, 10)).toBe("2 redeemed · 8 remaining");
    expect(promotionSummaryState(promotionSummary({ redemptionCount: 10 }))).toBe("exhausted");
  });
});
