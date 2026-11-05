// @vitest-environment jsdom
// Route tests live under src/ (never under app/): any file in the expo-router app/ directory is
// treated as a route and bundled by `expo export`, which would pull vitest/vite into the web build.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { meContext, TENANT_A } from "../test-support/fixtures";
import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import type { CommerceSettings } from "../settings/model";

const mocks = vi.hoisted(() => ({
  getCommerce: vi.fn<() => Promise<CommerceSettings>>(),
}));

vi.mock("../session/SessionProvider", () => ({
  useSession: () => ({ getTenantClient: () => ({}) }),
}));
vi.mock("../settings/adapter", () => ({
  resolveSettingsAdapter: () => ({ getCommerce: mocks.getCommerce }),
}));

import { StorefrontScreen } from "./StorefrontScreen";

const BRAND = "55555555-5555-4555-8555-555555555555";
const LOCATION = "66666666-6666-4666-8666-666666666666";

function commerce(): CommerceSettings {
  const storefront = {
    brandId: BRAND,
    brandName: "Acme Apparel",
    fulfillmentInventoryLocationId: LOCATION,
    currency: "EGP",
    codEnabled: true,
  };
  return {
    storefront,
    storefronts: [storefront],
    returns: { enabled: true, windowDays: 14, manualRefundsEnabled: false, maxManualRefundMinor: null },
  };
}

/** meContext omits settings access by default; inject it so the checkout section is reachable. */
function withSettings(
  access: { canRead: boolean; canManage: boolean } | null,
  overrides: Parameters<typeof meContext>[1] = {},
): MeContextResponse {
  const context = meContext(TENANT_A, overrides);
  if (access) (context.access as { settings?: unknown }).settings = access;
  return context;
}

function renderScreen(context: MeContextResponse, callbacks: Partial<Record<string, () => void>> = {}) {
  return render(
    <StorefrontScreen
      tenantId={TENANT_A}
      context={context}
      onManageCheckout={callbacks.onManageCheckout ?? vi.fn()}
      onOpenProducts={callbacks.onOpenProducts ?? vi.fn()}
      onOpenPromotions={callbacks.onOpenPromotions ?? vi.fn()}
      onBack={callbacks.onBack ?? vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCommerce.mockResolvedValue(commerce());
});
afterEach(() => cleanup());

describe("StorefrontScreen", () => {
  it("surfaces the live checkout configuration per brand when settings are readable", async () => {
    renderScreen(withSettings({ canRead: true, canManage: true }));

    expect(await screen.findByTestId(`storefront-brand-${BRAND}`)).toBeTruthy();
    expect(screen.getByText("Acme Apparel")).toBeTruthy();
    expect(screen.getByText("EGP")).toBeTruthy();
    expect(screen.getByTestId("storefront-manage-checkout")).toBeTruthy();
  });

  it("hides the manage affordance when settings are read-only but still shows the config", async () => {
    renderScreen(withSettings({ canRead: true, canManage: false }));

    expect(await screen.findByTestId(`storefront-brand-${BRAND}`)).toBeTruthy();
    expect(screen.queryByTestId("storefront-manage-checkout")).toBeNull();
  });

  it("explains missing access and never calls the settings read when settings are not granted", () => {
    renderScreen(withSettings(null));

    expect(screen.getByText("You don't have access to storefront checkout settings.")).toBeTruthy();
    expect(mocks.getCommerce).not.toHaveBeenCalled();
    // The returns card is part of the settings surface, so it is hidden too.
    expect(screen.queryByTestId("storefront-open-returns")).toBeNull();
  });

  it("routes each website control into its existing editor", async () => {
    const onOpenProducts = vi.fn();
    const onOpenPromotions = vi.fn();
    const onManageCheckout = vi.fn();
    renderScreen(withSettings({ canRead: true, canManage: true }), {
      onOpenProducts,
      onOpenPromotions,
      onManageCheckout,
    });

    fireEvent.click(screen.getByTestId("storefront-open-products"));
    fireEvent.click(screen.getByTestId("storefront-open-promotions"));
    fireEvent.click(screen.getByTestId("storefront-open-returns"));
    fireEvent.click(await screen.findByTestId("storefront-manage-checkout"));

    expect(onOpenProducts).toHaveBeenCalledTimes(1);
    expect(onOpenPromotions).toHaveBeenCalledTimes(1);
    expect(onManageCheckout).toHaveBeenCalledTimes(2); // returns card + manage button share the editor
  });

  it("gates the catalog and promotions cards on their own capabilities", () => {
    renderScreen(withSettings(null, { catalog: { canRead: false }, promotions: null }));

    expect(screen.queryByTestId("storefront-open-products")).toBeNull();
    expect(screen.queryByTestId("storefront-open-promotions")).toBeNull();
  });
});
