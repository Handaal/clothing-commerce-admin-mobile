// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createObservationStore } from "../catalog/observations";
import {
  BRAND_A,
  MEMBERSHIP_A,
  PRODUCT_A,
  TENANT_A,
  meContext,
  productWriteResponse,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { CreateProductScreen } from "./CreateProductScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  createProduct: vi.fn(),
}));

vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_1",
    sessionId: "sess_1",
    getToken: () => Promise.resolve("test-token"),
    signOut: vi.fn(),
  }),
}));

vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => ({
      tenantId,
      getContext: mocks.getContext,
      createProduct: mocks.createProduct,
    }),
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

// Keep expo-crypto (native module needing __DEV__) out of the jsdom module graph; tests inject keys.
vi.mock("expo-crypto", () => ({ randomUUID: () => "mock-uuid" }));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onCreated = vi.fn();
let store = createObservationStore();
let keySeq = 0;
const generateKey = () => `key-${++keySeq}`;

const BRANDS_SINGLE = [{ id: BRAND_A, name: "Acme Brand" }];
const BRAND_B = "aa000000-0000-4000-8000-000000000002";
const BRANDS_MULTI = [
  { id: BRAND_A, name: "Acme Brand" },
  { id: BRAND_B, name: "Outlet" },
];

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <CreateProductScreen
      tenantId={state.tenantId}
      context={state.context}
      onCreated={onCreated}
      onBack={() => {}}
      generateIdempotencyKey={generateKey}
      observationStore={store}
    />
  );
}

function renderScreen() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  store = createObservationStore();
  keySeq = 0;
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A, { catalog: { brands: BRANDS_SINGLE } }));
});

afterEach(() => cleanup());

describe("CreateProductScreen", () => {
  it("uses the single accessible brand directly (no brand switcher)", async () => {
    mocks.createProduct.mockResolvedValue(productWriteResponse());
    renderScreen();
    expect(await screen.findByText("Brand: Acme Brand")).toBeTruthy();
    expect(screen.queryByTestId("create-brand-" + BRAND_A)).toBeNull();
  });

  it("derives the slug from the name until edited, and creates with canonical fields", async () => {
    mocks.createProduct.mockResolvedValue(productWriteResponse({ productId: PRODUCT_A }));
    renderScreen();
    fireEvent.change(await screen.findByTestId("create-name"), {
      target: { value: "Summer Linen Shirt" },
    });
    expect((screen.getByTestId("create-slug") as HTMLInputElement).value).toBe(
      "summer-linen-shirt",
    );
    fireEvent.change(screen.getByTestId("create-style-code"), { target: { value: "LS-001" } });
    fireEvent.click(screen.getByTestId("create-submit"));

    await screen.findByText("Product created");
    expect(mocks.createProduct).toHaveBeenCalledWith({
      brandId: BRAND_A,
      name: "Summer Linen Shirt",
      slug: "summer-linen-shirt",
      styleCode: "LS-001",
      idempotencyKey: "key-1",
    });
  });

  it("records the observed storefront status and slug, then navigates on manage", async () => {
    mocks.createProduct.mockResolvedValue(
      productWriteResponse({
        productId: PRODUCT_A,
        status: "draft",
        storefrontStatus: "unpublished",
      }),
    );
    renderScreen();
    fireEvent.change(await screen.findByTestId("create-name"), { target: { value: "Tee" } });
    fireEvent.click(screen.getByTestId("create-submit"));

    await screen.findByText("Product created");
    expect(store.get(PRODUCT_A)).toMatchObject({
      status: "draft",
      storefrontStatus: "unpublished",
      slug: "tee",
    });
    fireEvent.click(screen.getByTestId("open-created-product"));
    expect(onCreated).toHaveBeenCalledWith(PRODUCT_A);
  });

  it("blocks submit with a local message when the name is blank", async () => {
    renderScreen();
    fireEvent.click(await screen.findByTestId("create-submit"));
    expect(screen.getByText("Enter a product name.")).toBeTruthy();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it("maps a SLUG_CONFLICT to an editable, non-retryable message", async () => {
    mocks.createProduct.mockRejectedValue(new ApiHttpError("dupe", 409, "SLUG_CONFLICT", "req-1"));
    renderScreen();
    fireEvent.change(await screen.findByTestId("create-name"), { target: { value: "Tee" } });
    fireEvent.click(screen.getByTestId("create-submit"));
    expect(await screen.findByText("Slug already in use")).toBeTruthy();
    expect(screen.queryByTestId("create-retry")).toBeNull();
  });

  it("reuses the SAME idempotency key on an ambiguous-network retry (no duplicate product)", async () => {
    mocks.createProduct
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(productWriteResponse());
    renderScreen();
    fireEvent.change(await screen.findByTestId("create-name"), { target: { value: "Tee" } });
    fireEvent.click(screen.getByTestId("create-submit"));

    fireEvent.click(await screen.findByTestId("create-retry"));
    await screen.findByText("Product created");

    expect(mocks.createProduct).toHaveBeenCalledTimes(2);
    expect(mocks.createProduct.mock.calls[0][0].idempotencyKey).toBe("key-1");
    expect(mocks.createProduct.mock.calls[1][0].idempotencyKey).toBe("key-1");
  });

  it("surfaces a 403 as not-authorized with no retry", async () => {
    mocks.createProduct.mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    renderScreen();
    fireEvent.change(await screen.findByTestId("create-name"), { target: { value: "Tee" } });
    fireEvent.click(screen.getByTestId("create-submit"));
    expect(await screen.findByText("Not authorized")).toBeTruthy();
    expect(screen.queryByTestId("create-retry")).toBeNull();
  });

  it("requires an explicit brand choice for a multi-brand tenant", async () => {
    mocks.getContext.mockResolvedValue(meContext(TENANT_A, { catalog: { brands: BRANDS_MULTI } }));
    renderScreen();
    fireEvent.change(await screen.findByTestId("create-name"), { target: { value: "Tee" } });
    fireEvent.click(screen.getByTestId("create-submit"));
    expect(screen.getByText("Choose a brand for this product.")).toBeTruthy();
    expect(mocks.createProduct).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId(`create-brand-${BRAND_B}`));
    mocks.createProduct.mockResolvedValue(productWriteResponse());
    fireEvent.click(screen.getByTestId("create-submit"));
    await waitFor(() =>
      expect(mocks.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ brandId: BRAND_B }),
      ),
    );
  });

  it("shows a cannot-create message when no brand is accessible", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, { catalog: { canRead: true, tenantWide: true, brands: [] } }),
    );
    renderScreen();
    expect(await screen.findByText(/No brand is available/)).toBeTruthy();
  });
});
