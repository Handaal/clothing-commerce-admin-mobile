// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createObservationStore } from "../catalog/observations";
import type { PickedImage } from "../catalog/media";
import {
  BRAND_A,
  MEDIA_A,
  MEMBERSHIP_A,
  PRODUCT_A,
  TENANT_A,
  VARIANT_A,
  createVariantResponse,
  meContext,
  productDetail,
  productWriteResponse,
  publishResponse,
  registerMediaResponse,
  setVariantPriceResponse,
  tenant,
  unpublishResponse,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { ProductManageScreen } from "./ProductManageScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  getProduct: vi.fn(),
  updateProduct: vi.fn(),
  setProductStatus: vi.fn(),
  publishProduct: vi.fn(),
  unpublishProduct: vi.fn(),
  createVariant: vi.fn(),
  setVariantPrice: vi.fn(),
  createProductMediaUploadIntent: vi.fn(),
  registerProductMedia: vi.fn(),
  archiveProductMedia: vi.fn(),
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
    withTenant: (tenantId: string) => ({ tenantId, ...mocks }),
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

vi.mock("expo-crypto", () => ({ randomUUID: () => "mock-uuid" }));

import { SessionProvider, useSession } from "../session/SessionProvider";

let store = createObservationStore();
let keySeq = 0;
const generateKey = () => `key-${++keySeq}`;
const picker = vi.fn();
const uploadFetch = vi.fn();

const image: PickedImage = { body: "bytes", contentType: "image/jpeg", fileName: "shot.jpg" };

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <ProductManageScreen
      tenantId={state.tenantId}
      productId={PRODUCT_A}
      onBack={() => {}}
      generateIdempotencyKey={generateKey}
      observationStore={store}
      imagePicker={picker}
      uploadFetch={uploadFetch as unknown as typeof globalThis.fetch}
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
  mocks.getContext.mockResolvedValue(
    meContext(TENANT_A, { catalog: { brands: [{ id: BRAND_A, name: "Acme Brand" }] } }),
  );
  mocks.getProduct.mockResolvedValue(productDetail());
});

afterEach(() => cleanup());

describe("ProductManageScreen", () => {
  it("loads the product and distinguishes internal status from Storefront publication", async () => {
    renderScreen();
    expect(await screen.findByTestId("detail-status")).toBeTruthy();
    expect(screen.getByTestId("detail-status").textContent).toContain("active");
    expect(screen.getByTestId("detail-storefront-status").textContent).toContain("unknown");
    expect(screen.getByTestId("publication-summary").textContent).toMatch(/not observed/i);
  });

  it("edits product details through updateProduct", async () => {
    mocks.updateProduct.mockResolvedValue({ productId: PRODUCT_A });
    renderScreen();
    fireEvent.click(await screen.findByTestId("section-details"));
    fireEvent.change(screen.getByTestId("edit-name"), { target: { value: "Linen Shirt v2" } });
    fireEvent.click(screen.getByTestId("edit-submit"));
    expect(await screen.findByTestId("edit-success")).toBeTruthy();
    expect(mocks.updateProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: PRODUCT_A,
        name: "Linen Shirt v2",
        idempotencyKey: "key-1",
      }),
    );
  });

  it("creates a variant and maps a SKU_CONFLICT to an editable message", async () => {
    mocks.createVariant.mockRejectedValueOnce(
      new ApiHttpError("dupe", 409, "SKU_CONFLICT", "req-1"),
    );
    renderScreen();
    fireEvent.click(await screen.findByTestId("section-variants"));
    fireEvent.change(screen.getByTestId("variant-sku"), { target: { value: "LS-001-M" } });
    fireEvent.click(screen.getByTestId("variant-submit"));
    expect(await screen.findByText("SKU already in use")).toBeTruthy();

    mocks.createVariant.mockResolvedValueOnce(createVariantResponse());
    fireEvent.click(screen.getByText("Dismiss"));
    fireEvent.click(screen.getByTestId("variant-submit"));
    expect(await screen.findByTestId("variant-success")).toBeTruthy();
  });

  it("sets a selling price using safe decimal→minor conversion with explicit currency", async () => {
    mocks.setVariantPrice.mockResolvedValue(setVariantPriceResponse({ amountMinor: 3000 }));
    renderScreen();
    fireEvent.click(await screen.findByTestId("section-variants"));
    fireEvent.click(screen.getByTestId(`price-variant-${VARIANT_A}`));
    // The currency seeds from the existing price and the amount from the current value.
    expect((screen.getByTestId("price-currency") as HTMLInputElement).value).toBe("USD");
    fireEvent.change(screen.getByTestId("price-amount"), { target: { value: "30.00" } });
    fireEvent.click(screen.getByTestId("price-submit"));
    expect(await screen.findByTestId("price-success")).toBeTruthy();
    expect(mocks.setVariantPrice).toHaveBeenCalledWith({
      variantId: VARIANT_A,
      currency: "USD",
      amountMinor: 3000,
      idempotencyKey: "key-1",
    });
  });

  it("rejects a malformed price locally before calling the API", async () => {
    renderScreen();
    fireEvent.click(await screen.findByTestId("section-variants"));
    fireEvent.click(screen.getByTestId(`price-variant-${VARIANT_A}`));
    fireEvent.change(screen.getByTestId("price-amount"), { target: { value: "25.999" } });
    fireEvent.click(screen.getByTestId("price-submit"));
    expect(screen.getByText(/at most 2 decimal/i)).toBeTruthy();
    expect(mocks.setVariantPrice).not.toHaveBeenCalled();
  });

  it("publishes, records the observed storefront state, then offers unpublish", async () => {
    mocks.publishProduct.mockResolvedValue(publishResponse());
    mocks.unpublishProduct.mockResolvedValue(unpublishResponse());
    renderScreen();
    fireEvent.click(await screen.findByTestId("publish-submit"));
    expect(await screen.findByTestId("publish-success")).toBeTruthy();
    expect(store.get(PRODUCT_A)).toMatchObject({ storefrontStatus: "published" });
    expect(screen.getByTestId("detail-storefront-status").textContent).toContain("published");

    fireEvent.click(screen.getByTestId("unpublish-submit"));
    expect(await screen.findByTestId("unpublish-success")).toBeTruthy();
    expect(store.get(PRODUCT_A)).toMatchObject({ storefrontStatus: "unpublished" });
  });

  it("maps PRODUCT_NOT_PUBLISHABLE to a manager-facing prerequisite explanation", async () => {
    mocks.publishProduct.mockRejectedValue(
      new ApiHttpError("no", 409, "PRODUCT_NOT_PUBLISHABLE", "req-1"),
    );
    renderScreen();
    fireEvent.click(await screen.findByTestId("publish-submit"));
    expect(await screen.findByText("Not ready to publish")).toBeTruthy();
    expect(screen.getByTestId("publish-error").textContent).toMatch(/active variant/i);
  });

  it("proves an authorization-denied publish path (403 → not authorized, not applied)", async () => {
    mocks.publishProduct.mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    renderScreen();
    fireEvent.click(await screen.findByTestId("publish-submit"));
    expect(await screen.findByText("Not authorized")).toBeTruthy();
    expect(screen.getByTestId("publish-error").textContent).toMatch(/not applied/i);
  });

  it("activates a draft product and records the new status", async () => {
    mocks.getProduct.mockResolvedValue(
      productDetail({ product: { ...productDetail().product, status: "draft" } }),
    );
    mocks.setProductStatus.mockResolvedValue(
      productWriteResponse({ status: "active", storefrontStatus: "unpublished" }),
    );
    renderScreen();
    fireEvent.click(await screen.findByTestId("section-lifecycle"));
    fireEvent.click(screen.getByTestId("lifecycle-active"));
    expect(await screen.findByTestId("lifecycle-success")).toBeTruthy();
    expect(mocks.setProductStatus).toHaveBeenCalledWith(
      expect.objectContaining({ productId: PRODUCT_A, status: "active" }),
    );
    expect(store.get(PRODUCT_A)).toMatchObject({ status: "active" });
  });

  it("requires a two-step confirm to archive (never a one-tap delete)", async () => {
    mocks.setProductStatus.mockResolvedValue(productWriteResponse({ status: "archived" }));
    renderScreen();
    fireEvent.click(await screen.findByTestId("section-lifecycle"));
    // First press only arms the confirm — no API call yet.
    fireEvent.click(screen.getByTestId("lifecycle-archive"));
    expect(mocks.setProductStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("lifecycle-archive"));
    await waitFor(() =>
      expect(mocks.setProductStatus).toHaveBeenCalledWith(
        expect.objectContaining({ status: "archived" }),
      ),
    );
  });

  it("routes INVALID_LIFECYCLE_TRANSITION to a refresh recovery", async () => {
    mocks.getProduct.mockResolvedValue(
      productDetail({ product: { ...productDetail().product, status: "draft" } }),
    );
    mocks.setProductStatus.mockRejectedValue(
      new ApiHttpError("no", 409, "INVALID_LIFECYCLE_TRANSITION", "req-1"),
    );
    renderScreen();
    fireEvent.click(await screen.findByTestId("section-lifecycle"));
    fireEvent.click(screen.getByTestId("lifecycle-active"));
    expect(await screen.findByText("Status change not allowed")).toBeTruthy();
    expect(screen.getByTestId("write-refresh")).toBeTruthy();
  });

  it("runs the media flow: pick → signed upload → register", async () => {
    picker.mockResolvedValue(image);
    uploadFetch.mockResolvedValue({ ok: true, status: 200 });
    mocks.createProductMediaUploadIntent.mockResolvedValue({
      bucket: "product-media",
      path: "tenant/p/photo.jpg",
      contentType: "image/jpeg",
      uploadUrl: "https://storage.example/signed",
      expiresAt: null,
    });
    mocks.registerProductMedia.mockResolvedValue(registerMediaResponse());
    renderScreen();
    fireEvent.click(await screen.findByTestId("section-media"));
    fireEvent.click(screen.getByTestId("media-pick"));
    await screen.findByTestId("media-picked");
    fireEvent.click(screen.getByTestId("media-upload"));

    expect(await screen.findByTestId("media-success")).toBeTruthy();
    // The session media list is appended in a post-success effect — await that re-render.
    expect(await screen.findByTestId(`media-${MEDIA_A}`)).toBeTruthy();
    expect(uploadFetch).toHaveBeenCalledWith(
      "https://storage.example/signed",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(mocks.registerProductMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: PRODUCT_A,
        bucket: "product-media",
        path: "tenant/p/photo.jpg",
      }),
    );
  });

  it("isolates a missing signed URL as a storage gap (no register attempted)", async () => {
    picker.mockResolvedValue(image);
    mocks.createProductMediaUploadIntent.mockResolvedValue({
      bucket: "product-media",
      path: "p",
      contentType: "image/jpeg",
      uploadUrl: null,
      expiresAt: null,
    });
    renderScreen();
    fireEvent.click(await screen.findByTestId("section-media"));
    fireEvent.click(screen.getByTestId("media-pick"));
    await screen.findByTestId("media-picked");
    fireEvent.click(screen.getByTestId("media-upload"));
    expect(await screen.findByTestId("media-prepare-error")).toBeTruthy();
    expect(mocks.registerProductMedia).not.toHaveBeenCalled();
  });

  it("surfaces a load error with retry instead of a fake product", async () => {
    mocks.getProduct.mockRejectedValue(new ApiNetworkError("down"));
    renderScreen();
    expect(await screen.findByText("Cannot reach the Commerce API")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });
});
