import { describe, expect, it } from "vitest";

import { promotionDetail, PRODUCT_A, VARIANT_A } from "../test-support/fixtures";
import {
  buildCreatePromotionRequest,
  buildUpdatePromotionRequest,
  EMPTY_PROMOTION_FORM,
  validatePromotionForm,
  type PromotionFormState,
} from "./form";

function form(overrides: Partial<PromotionFormState> = {}): PromotionFormState {
  return {
    ...EMPTY_PROMOTION_FORM,
    name: "Launch offer",
    benefitValue: "10",
    ...overrides,
  };
}

describe("Promotion form mapping", () => {
  it("builds a percentage automatic Promotion", () => {
    expect(buildCreatePromotionRequest(form())).toEqual(
      expect.objectContaining({
        name: "Launch offer",
        benefitType: "percentage",
        benefitPercentBp: 1000,
        activationType: "automatic",
        targetType: "order",
        status: "inactive",
      }),
    );
  });

  it("builds a fixed amount Promotion in integer minor units", () => {
    expect(
      buildCreatePromotionRequest(
        form({ benefitType: "fixed_amount", benefitValue: "25.99", currency: "usd" }),
      ),
    ).toEqual(expect.objectContaining({ benefitAmountMinor: 2599, benefitCurrency: "USD" }));
  });

  it("maps Product and Variant targeting without raw-id text fields", () => {
    const request = buildCreatePromotionRequest(
      form({
        targetType: "variant_scope",
        targets: [
          { target: { productId: PRODUCT_A, variantId: null }, label: "Linen Shirt" },
          { target: { productId: null, variantId: VARIANT_A }, label: "Linen Shirt · Medium" },
        ],
      }),
    );
    expect(request.targets).toEqual([
      { productId: PRODUCT_A, variantId: null },
      { productId: null, variantId: VARIANT_A },
    ]);
  });

  it("maps schedule and global usage limit", () => {
    const request = buildCreatePromotionRequest(
      form({
        startsAt: "2026-10-01T09:00:00+02:00",
        endsAt: "2026-10-31T09:00:00+02:00",
        globalLimit: "50",
      }),
    );
    expect(request.startsAt).toBe("2026-10-01T07:00:00.000Z");
    expect(request.endsAt).toBe("2026-10-31T07:00:00.000Z");
    expect(request.globalRedemptionLimit).toBe(50);
  });

  it("creates a single-use voucher as a Promotion Code with maxRedemptions 1", () => {
    expect(
      buildCreatePromotionRequest(
        form({ activationType: "code", initialCode: "one_time", codeLimitKind: "single" }),
      ).codes,
    ).toEqual([{ code: "ONE_TIME", maxRedemptions: 1 }]);
  });

  it("validates missing targets, invalid windows and invalid codes before submit", () => {
    const errors = validatePromotionForm(
      form({
        targetType: "variant_scope",
        activationType: "code",
        initialCode: "bad code!",
        startsAt: "2026-10-31T00:00:00Z",
        endsAt: "2026-10-01T00:00:00Z",
      }),
      "create",
    );
    expect(errors.targets).toBeTruthy();
    expect(errors.initialCode).toBeTruthy();
    expect(errors.endsAt).toBe("End must be after start.");
  });

  it("omits economic fields from post-redemption edits but keeps metadata and schedule", () => {
    const detail = promotionDetail({ economicsLocked: true });
    expect(
      buildUpdatePromotionRequest(
        form({ name: "Renamed", startsAt: "2026-10-01T00:00:00Z", benefitValue: "50" }),
        detail,
      ),
    ).toEqual({
      name: "Renamed",
      description: null,
      startsAt: "2026-10-01T00:00:00.000Z",
      endsAt: null,
    });
  });

  it("does not resend unchanged economics for a metadata-only edit", () => {
    const detail = promotionDetail({ economicsLocked: false });
    const state = {
      ...form(),
      name: "Renamed only",
      benefitValue: "10",
      minimumSubtotal: "50.00",
      maximumDiscount: "25.00",
    };
    expect(buildUpdatePromotionRequest(state, detail)).toEqual({
      name: "Renamed only",
      description: null,
      startsAt: null,
      endsAt: null,
    });
  });
});
