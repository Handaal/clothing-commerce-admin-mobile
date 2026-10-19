// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BRAND_A,
  MEMBERSHIP_A,
  PRODUCT_A,
  TENANT_A,
  meContext,
  productList,
  productListItem,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { ProductsListScreen } from "./ProductsListScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listProducts: vi.fn(),
  getProduct: vi.fn(),
  withTenant: vi.fn(),
  signOut: vi.fn(async () => {}),
}));

// Reproduce the real Clerk shape (new getToken identity per render); always signed in for these tests.
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

// The real SDK boundary is preserved: the screen reaches the SDK only through
// SessionProvider → getTenantClient(tenantId) → withTenant(tenantId).listProducts().
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

// Keep expo-secure-store (native) out of the test module graph; tests always inject storage.
vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onOpenProduct = vi.fn();
const onCreateProduct = vi.fn();

// Renders the real SessionProvider and mounts the screen with the resolved tenant/context once
// bootstrap completes — the same data path the route wrapper uses in production.
function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <ProductsListScreen
      tenantId={state.tenantId}
      context={state.context}
      onOpenProduct={onOpenProduct}
      onCreateProduct={onCreateProduct}
      onBack={() => {}}
    />
  );
}

function renderProducts() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(
    meContext(TENANT_A, { catalog: { brands: [{ id: BRAND_A, name: "Acme Brand" }] } }),
  );
});

afterEach(() => cleanup());

describe("ProductsListScreen", () => {
  it("shows a loading state while products are being fetched", async () => {
    mocks.listProducts.mockReturnValue(new Promise(() => {}));
    renderProducts();
    expect(await screen.findByText("Loading products…")).toBeTruthy();
  });

  it("renders a populated list scoped to the resolved tenant, with status and brand", async () => {
    mocks.listProducts.mockResolvedValue(
      productList([
        productListItem(PRODUCT_A, "Linen Shirt", { styleCode: "LS-001", status: "active" }),
      ]),
    );
    renderProducts();

    expect(await screen.findByText("Linen Shirt")).toBeTruthy();
    expect(screen.getByTestId(`product-status-${PRODUCT_A}`).textContent).toBe("active");
    expect(screen.getByText("LS-001")).toBeTruthy();
    expect(screen.getByText("Acme Brand")).toBeTruthy();
    // The call went through the tenant-scoped client for the resolved tenant.
    expect(mocks.withTenant).toHaveBeenCalledWith(TENANT_A);
    expect(mocks.listProducts).toHaveBeenCalledTimes(1);
  });

  it("shows an explicit empty state (not an error) when there are zero products", async () => {
    mocks.listProducts.mockResolvedValue(productList([]));
    renderProducts();
    expect(await screen.findByText(/No products yet/)).toBeTruthy();
  });

  it("surfaces a classified network error with a retry", async () => {
    mocks.listProducts.mockRejectedValue(new ApiNetworkError("down"));
    renderProducts();
    expect(await screen.findByText("Cannot reach the Commerce API")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("retries the fetch when the user taps Try again", async () => {
    mocks.listProducts
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(productList([productListItem(PRODUCT_A, "Linen Shirt")]));
    renderProducts();

    fireEvent.click(await screen.findByText("Try again"));

    expect(await screen.findByText("Linen Shirt")).toBeTruthy();
    expect(mocks.listProducts).toHaveBeenCalledTimes(2);
  });

  it("navigates to detail with the real product id when a row is tapped", async () => {
    mocks.listProducts.mockResolvedValue(productList([productListItem(PRODUCT_A, "Linen Shirt")]));
    renderProducts();

    fireEvent.click(await screen.findByTestId(`product-row-${PRODUCT_A}`));
    expect(onOpenProduct).toHaveBeenCalledWith(PRODUCT_A);
  });

  it("does NOT turn a 403 into an empty list — it shows access denied", async () => {
    mocks.listProducts.mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    renderProducts();

    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText(/No products yet/)).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("shows a no-access message and never calls the API without catalog.read", async () => {
    mocks.getContext.mockResolvedValue(meContext(TENANT_A, { catalog: { canRead: false } }));
    renderProducts();

    expect(await screen.findByText(/do not have read access/)).toBeTruthy();
    expect(mocks.listProducts).not.toHaveBeenCalled();
  });

  it("offers a Create product affordance when a brand is accessible", async () => {
    mocks.listProducts.mockResolvedValue(productList([productListItem(PRODUCT_A, "Linen Shirt")]));
    renderProducts();
    fireEvent.click(await screen.findByTestId("create-product"));
    expect(onCreateProduct).toHaveBeenCalledTimes(1);
  });

  it("uses the canonical server-side status filter", async () => {
    mocks.listProducts.mockResolvedValue(productList([productListItem(PRODUCT_A, "Linen Shirt")]));
    renderProducts();
    await screen.findByText("Linen Shirt");

    fireEvent.click(screen.getByTestId("product-status-filter-draft"));

    await waitFor(() => expect(mocks.listProducts).toHaveBeenLastCalledWith({ status: "draft" }));
  });

  it("hides Create product when no brand is accessible (never guesses a brand id)", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, { catalog: { canRead: true, tenantWide: true, brands: [] } }),
    );
    mocks.listProducts.mockResolvedValue(productList([productListItem(PRODUCT_A, "Linen Shirt")]));
    renderProducts();
    await screen.findByText("Linen Shirt");
    expect(screen.queryByTestId("create-product")).toBeNull();
  });

  it("shows an at-a-glance Storefront publication state per row", async () => {
    mocks.listProducts.mockResolvedValue(productList([productListItem(PRODUCT_A, "Linen Shirt")]));
    renderProducts();
    await screen.findByText("Linen Shirt");
    // Nothing observed this session yet → an honest "not observed" note, never a guessed status.
    expect(screen.getByText(/not observed this session/i)).toBeTruthy();
  });

  it("keeps management on the detail screen — rows carry no inline edit/delete controls", async () => {
    mocks.listProducts.mockResolvedValue(productList([productListItem(PRODUCT_A, "Linen Shirt")]));
    renderProducts();
    await screen.findByText("Linen Shirt");
    expect(screen.queryByText(/^(edit|delete|archive|save)$/i)).toBeNull();
  });
});
