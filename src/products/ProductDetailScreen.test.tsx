// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MEMBERSHIP_A,
  PRODUCT_A,
  TENANT_A,
  VARIANT_A,
  meContext,
  productDetail,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { ProductDetailScreen } from "./ProductDetailScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listProducts: vi.fn(),
  getProduct: vi.fn(),
  withTenant: vi.fn(),
  signOut: vi.fn(async () => {}),
}));

vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_1",
    sessionId: "sess_1",
    getToken: () => Promise.resolve("test-token"),
    signOut: mocks.signOut,
  }),
}));

vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => {
      mocks.withTenant(tenantId);
      return {
        tenantId,
        getContext: mocks.getContext,
        listProducts: mocks.listProducts,
        getProduct: mocks.getProduct,
      };
    },
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onBack = vi.fn();

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return <ProductDetailScreen tenantId={state.tenantId} productId={PRODUCT_A} onBack={onBack} />;
}

function renderDetail() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
});

afterEach(() => cleanup());

describe("ProductDetailScreen", () => {
  it("shows a loading state while the product is being fetched", async () => {
    mocks.getProduct.mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(await screen.findByText("Loading product…")).toBeTruthy();
  });

  it("renders the product, its variants, options and prices on success", async () => {
    mocks.getProduct.mockResolvedValue(productDetail());
    renderDetail();

    expect(await screen.findByText("Linen Shirt")).toBeTruthy();
    expect(screen.getByTestId("detail-status").textContent).toBe("active");
    // Variant section rendered with SKU, name and formatted price.
    expect(screen.getByTestId(`variant-${VARIANT_A}`)).toBeTruthy();
    expect(screen.getByText("Medium")).toBeTruthy();
    expect(screen.getByText("LS-001-M")).toBeTruthy();
    expect(screen.getByText("USD 25.99")).toBeTruthy();
    expect(screen.getByText("Size")).toBeTruthy();
    expect(screen.getByText("M")).toBeTruthy();
    // Fetched through the tenant-scoped client for the resolved tenant.
    expect(mocks.withTenant).toHaveBeenCalledWith(TENANT_A);
    expect(mocks.getProduct).toHaveBeenCalledWith(PRODUCT_A);
  });

  it("shows a not-found state for a 404 (no retry, back available)", async () => {
    mocks.getProduct.mockRejectedValue(new ApiHttpError("gone", 404, "NOT_FOUND", null));
    renderDetail();

    expect(await screen.findByText("Not found")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("shows an access-denied state for a 403 (no retry, back available)", async () => {
    mocks.getProduct.mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    renderDetail();

    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("surfaces a network error with a retry, and retries on tap", async () => {
    mocks.getProduct
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(productDetail());
    renderDetail();

    fireEvent.click(await screen.findByText("Try again"));

    expect(await screen.findByText("Linen Shirt")).toBeTruthy();
    expect(mocks.getProduct).toHaveBeenCalledTimes(2);
  });

  it("invokes onBack when the back control is tapped", async () => {
    mocks.getProduct.mockResolvedValue(productDetail());
    renderDetail();
    await screen.findByText("Linen Shirt");

    fireEvent.click(screen.getByText(/Back/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("renders variants with no mutation controls (read-only)", async () => {
    mocks.getProduct.mockResolvedValue(productDetail());
    renderDetail();
    await screen.findByText("Linen Shirt");
    expect(screen.queryByText(/edit|delete|archive|create|save|adjust|price change/i)).toBeNull();
  });
});
