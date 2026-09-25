// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import { TENANT_A, meContext, promotionDetail } from "../test-support/fixtures";
import type { PromotionClient } from "./client";
import { PromotionForm } from "./PromotionForm";

afterEach(() => cleanup());
const noop = () => {};
const keyFactory = () => "21212121-2121-4121-8121-212121212121";

function fakeClient(overrides: Partial<PromotionClient> = {}): PromotionClient {
  const detail = promotionDetail({ economicsLocked: false });
  return {
    listPromotions: async () => ({ total: 0, items: [] }),
    getPromotion: async () => detail,
    createPromotion: async () => detail,
    updatePromotion: async () => detail,
    setPromotionStatus: async () => detail,
    createPromotionCode: async () => detail,
    setPromotionCodeStatus: async () => detail,
    listProducts: async () => ({ items: [], pageInfo: { nextCursor: null, hasMore: false } }),
    getProduct: async () => ({
      product: {
        id: "product",
        name: "Product",
        styleCode: null,
        status: "active",
        brandId: "brand",
      },
      variants: [],
      options: [],
      prices: [],
    }),
    ...overrides,
  };
}

function typeInto(testID: string, value: string) {
  fireEvent.change(screen.getByTestId(testID), { target: { value } });
}

describe("PromotionForm", () => {
  it("creates a percentage automatic Promotion through the SDK client", async () => {
    const createPromotion = vi.fn().mockResolvedValue(promotionDetail({ economicsLocked: false }));
    render(
      <PromotionForm
        mode="create"
        client={fakeClient({ createPromotion })}
        context={meContext(TENANT_A)}
        canManage
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory}
      />,
    );
    typeInto("promotion-name", "Ten percent");
    typeInto("promotion-benefit-value", "10");
    fireEvent.click(screen.getByTestId("promotion-submit"));
    await waitFor(() => expect(createPromotion).toHaveBeenCalledTimes(1));
    expect(createPromotion.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        name: "Ten percent",
        benefitType: "percentage",
        benefitPercentBp: 1000,
        activationType: "automatic",
        idempotencyKey: keyFactory(),
      }),
    );
  });

  it("creates a fixed, code-activated single-use voucher", async () => {
    const createPromotion = vi.fn().mockResolvedValue(promotionDetail({ economicsLocked: false }));
    render(
      <PromotionForm
        mode="create"
        client={fakeClient({ createPromotion })}
        context={meContext(TENANT_A)}
        canManage
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory}
      />,
    );
    typeInto("promotion-name", "Voucher");
    fireEvent.click(screen.getByTestId("promotion-benefit-type-fixed_amount"));
    typeInto("promotion-benefit-value", "5.00");
    fireEvent.click(screen.getByTestId("promotion-activation-code"));
    typeInto("promotion-initial-code", "once");
    fireEvent.click(screen.getByTestId("promotion-code-limit-single"));
    fireEvent.click(screen.getByTestId("promotion-submit"));
    await waitFor(() => expect(createPromotion).toHaveBeenCalledTimes(1));
    expect(createPromotion.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        benefitType: "fixed_amount",
        benefitAmountMinor: 500,
        benefitCurrency: "USD",
        activationType: "code",
        codes: [{ code: "ONCE", maxRedemptions: 1 }],
      }),
    );
  });

  it("surfaces a server permission denial with no unsafe retry", async () => {
    const createPromotion = vi
      .fn()
      .mockRejectedValue(new ApiHttpError("denied", 403, "FORBIDDEN", null));
    render(
      <PromotionForm
        mode="create"
        client={fakeClient({ createPromotion })}
        context={meContext(TENANT_A)}
        canManage
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory}
      />,
    );
    typeInto("promotion-name", "Denied");
    typeInto("promotion-benefit-value", "10");
    fireEvent.click(screen.getByTestId("promotion-submit"));
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByTestId("promotion-submit-retry")).toBeNull();
  });

  it("explains an economics-lock race returned by the server", async () => {
    const updatePromotion = vi
      .fn()
      .mockRejectedValue(new ApiHttpError("locked", 409, "PROMOTION_ECONOMICS_LOCKED", null));
    render(
      <PromotionForm
        mode="edit"
        client={fakeClient({ updatePromotion })}
        context={meContext(TENANT_A)}
        canManage
        initial={promotionDetail({ economicsLocked: false })}
        onSaved={noop}
        onBack={noop}
        generateIdempotencyKey={keyFactory}
      />,
    );
    typeInto("promotion-benefit-value", "15");
    fireEvent.click(screen.getByTestId("promotion-submit"));
    expect(await screen.findByText("Promotion already used")).toBeTruthy();
    expect(screen.getByText(/deactivate this Promotion and create a new one/i)).toBeTruthy();
  });
});
