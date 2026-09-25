// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import {
  PROMOTION_A,
  PROMOTION_CODE_A,
  TENANT_A,
  meContext,
  promotionDetail,
} from "../test-support/fixtures";
import type { PromotionClient } from "./client";
import { PromotionDetailScreen } from "./PromotionDetailScreen";

afterEach(() => cleanup());
const noop = () => {};
const keyFactory = () => "20202020-2020-4020-8020-202020202020";

function fakeClient(overrides: Partial<PromotionClient> = {}): PromotionClient {
  const detail = promotionDetail();
  return {
    listPromotions: async () => ({ total: 1, items: [detail] }),
    getPromotion: async () => detail,
    createPromotion: async () => detail,
    updatePromotion: async () => detail,
    setPromotionStatus: async () => detail,
    createPromotionCode: async () => detail,
    setPromotionCodeStatus: async () => detail,
    listProducts: async () => ({ items: [], pageInfo: { nextCursor: null, hasMore: false } }),
    getProduct: async () => ({
      product: { id: "", name: "", styleCode: null, status: "active", brandId: "" },
      variants: [],
      options: [],
      prices: [],
    }),
    ...overrides,
  };
}

function renderDetail(client: PromotionClient, canManage = true) {
  return render(
    <PromotionDetailScreen
      client={client}
      context={meContext(TENANT_A)}
      promotionId={PROMOTION_A}
      canRead
      canManage={canManage}
      onEdit={noop}
      onBack={noop}
      generateIdempotencyKey={keyFactory}
    />,
  );
}

describe("PromotionDetailScreen", () => {
  it("renders canonical detail and usage information", async () => {
    renderDetail(fakeClient());
    expect(await screen.findByText("Autumn offer")).toBeTruthy();
    expect(screen.getByText("10% off")).toBeTruthy();
    expect(screen.getByText(/2 redeemed · 8 remaining/)).toBeTruthy();
    expect(screen.getByText("Whole order")).toBeTruthy();
  });

  it("keeps detail readable while hiding every management action in read-only mode", async () => {
    renderDetail(fakeClient(), false);
    await screen.findByTestId("promotion-detail-status");
    expect(screen.getByTestId("promotion-detail-read-only")).toBeTruthy();
    expect(screen.queryByTestId("promotion-edit")).toBeNull();
    expect(screen.queryByTestId("promotion-status-toggle")).toBeNull();
    expect(screen.queryByTestId("promotion-create-code")).toBeNull();
  });

  it("activates an inactive Promotion and refreshes authoritative detail", async () => {
    const inactive = promotionDetail({ status: "inactive", economicsLocked: false });
    const active = promotionDetail({ status: "active", economicsLocked: false });
    const getPromotion = vi.fn().mockResolvedValueOnce(inactive).mockResolvedValueOnce(active);
    const setPromotionStatus = vi.fn().mockResolvedValue(active);
    renderDetail(fakeClient({ getPromotion, setPromotionStatus }));
    fireEvent.click(await screen.findByTestId("promotion-status-toggle"));
    await waitFor(() =>
      expect(setPromotionStatus).toHaveBeenCalledWith({
        promotionId: PROMOTION_A,
        status: "active",
        idempotencyKey: keyFactory(),
      }),
    );
    await waitFor(() => expect(getPromotion).toHaveBeenCalledTimes(2));
  });

  it("deactivates an active Promotion only after confirmation", async () => {
    const setPromotionStatus = vi.fn().mockResolvedValue(promotionDetail({ status: "inactive" }));
    renderDetail(fakeClient({ setPromotionStatus }));
    const button = await screen.findByTestId("promotion-status-toggle");
    fireEvent.click(button);
    expect(setPromotionStatus).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(setPromotionStatus).toHaveBeenCalledTimes(1));
  });

  it("creates a single-use voucher through the canonical code operation", async () => {
    const base = promotionDetail({ activationType: "code", economicsLocked: false });
    const created = promotionDetail({
      activationType: "code",
      economicsLocked: false,
      codes: [
        {
          id: PROMOTION_CODE_A,
          code: "ONCE",
          status: "active",
          maxRedemptions: 1,
          redemptionCount: 0,
          remainingRedemptions: 1,
        },
      ],
    });
    const getPromotion = vi.fn().mockResolvedValueOnce(base).mockResolvedValueOnce(created);
    const createPromotionCode = vi.fn().mockResolvedValue(created);
    renderDetail(fakeClient({ getPromotion, createPromotionCode }));
    fireEvent.change(await screen.findByTestId("promotion-new-code"), {
      target: { value: "once" },
    });
    fireEvent.click(screen.getByTestId("promotion-new-code-limit-single"));
    fireEvent.click(screen.getByTestId("promotion-create-code"));
    await waitFor(() =>
      expect(createPromotionCode).toHaveBeenCalledWith({
        promotionId: PROMOTION_A,
        code: "ONCE",
        maxRedemptions: 1,
        idempotencyKey: keyFactory(),
      }),
    );
    expect(await screen.findByText("Single-use voucher")).toBeTruthy();
  });

  it("disables an active code with confirmation", async () => {
    const detail = promotionDetail({
      activationType: "code",
      codes: [
        {
          id: PROMOTION_CODE_A,
          code: "SAVE",
          status: "active",
          maxRedemptions: null,
          redemptionCount: 3,
          remainingRedemptions: null,
        },
      ],
    });
    const setPromotionCodeStatus = vi.fn().mockResolvedValue(detail);
    renderDetail(fakeClient({ getPromotion: async () => detail, setPromotionCodeStatus }));
    const button = await screen.findByTestId(`promotion-code-disable-${PROMOTION_CODE_A}`);
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() =>
      expect(setPromotionCodeStatus).toHaveBeenCalledWith({
        codeId: PROMOTION_CODE_A,
        status: "disabled",
        idempotencyKey: keyFactory(),
      }),
    );
  });

  it("explains the post-redemption economics lock and replacement path", async () => {
    renderDetail(fakeClient());
    expect((await screen.findByTestId("promotion-detail-economics-locked")).textContent).toMatch(
      /deactivate and create a new Promotion/i,
    );
  });
});
