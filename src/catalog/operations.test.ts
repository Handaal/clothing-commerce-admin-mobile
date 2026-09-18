import { describe, expect, it, vi } from "vitest";

import {
  archiveProductMedia,
  createMediaUploadIntent,
  createProduct,
  createVariant,
  publishProduct,
  registerProductMedia,
  setProductStatus,
  setVariantPrice,
  slugify,
  unpublishProduct,
  updateProduct,
  validateProductName,
  validateSku,
  validateSlug,
  validateStyleCode,
} from "./operations";

const KEY = "idem-key-1";

describe("catalog producers", () => {
  it("threads the idempotency key and args to createProduct", async () => {
    const client = { createProduct: vi.fn().mockResolvedValue({ productId: "p1" }) };
    await createProduct(client, { brandId: "b1", name: "Tee", slug: "tee" }, KEY);
    expect(client.createProduct).toHaveBeenCalledWith({
      brandId: "b1",
      name: "Tee",
      slug: "tee",
      idempotencyKey: KEY,
    });
  });

  it("passes updateProduct fields verbatim with the key", async () => {
    const client = { updateProduct: vi.fn().mockResolvedValue({ productId: "p1" }) };
    await updateProduct(
      client,
      { productId: "p1", name: "Tee", slug: "tee", description: "soft" },
      KEY,
    );
    expect(client.updateProduct).toHaveBeenCalledWith({
      productId: "p1",
      name: "Tee",
      slug: "tee",
      description: "soft",
      idempotencyKey: KEY,
    });
  });

  it("sends setProductStatus with an optional archive reason", async () => {
    const client = { setProductStatus: vi.fn().mockResolvedValue({}) };
    await setProductStatus(
      client,
      { productId: "p1", status: "archived", archiveReason: "discontinued" },
      KEY,
    );
    expect(client.setProductStatus).toHaveBeenCalledWith({
      productId: "p1",
      status: "archived",
      archiveReason: "discontinued",
      idempotencyKey: KEY,
    });
  });

  it("publishes and unpublishes by product id with the key", async () => {
    const client = {
      publishProduct: vi.fn().mockResolvedValue({}),
      unpublishProduct: vi.fn().mockResolvedValue({}),
    };
    await publishProduct(client, "p1", KEY);
    await unpublishProduct(client, "p1", KEY);
    expect(client.publishProduct).toHaveBeenCalledWith({ productId: "p1", idempotencyKey: KEY });
    expect(client.unpublishProduct).toHaveBeenCalledWith({ productId: "p1", idempotencyKey: KEY });
  });

  it("creates a variant and sets a price with the key", async () => {
    const client = {
      createVariant: vi.fn().mockResolvedValue({}),
      setVariantPrice: vi.fn().mockResolvedValue({}),
    };
    await createVariant(client, { productId: "p1", sku: "TEE-M", displayName: "Medium" }, KEY);
    await setVariantPrice(client, { variantId: "v1", currency: "USD", amountMinor: 2599 }, KEY);
    expect(client.createVariant).toHaveBeenCalledWith({
      productId: "p1",
      sku: "TEE-M",
      displayName: "Medium",
      idempotencyKey: KEY,
    });
    expect(client.setVariantPrice).toHaveBeenCalledWith({
      variantId: "v1",
      currency: "USD",
      amountMinor: 2599,
      idempotencyKey: KEY,
    });
  });

  it("requests a media upload intent WITHOUT an idempotency key (per contract)", async () => {
    const client = { createProductMediaUploadIntent: vi.fn().mockResolvedValue({}) };
    await createMediaUploadIntent(client, { productId: "p1", contentType: "image/jpeg" });
    expect(client.createProductMediaUploadIntent).toHaveBeenCalledWith({
      productId: "p1",
      contentType: "image/jpeg",
    });
    const call = client.createProductMediaUploadIntent.mock.calls[0][0];
    expect(call).not.toHaveProperty("idempotencyKey");
  });

  it("registers and archives media with the key", async () => {
    const client = {
      registerProductMedia: vi.fn().mockResolvedValue({}),
      archiveProductMedia: vi.fn().mockResolvedValue({}),
    };
    await registerProductMedia(
      client,
      { productId: "p1", bucket: "media", path: "p/1.jpg", isPrimary: true },
      KEY,
    );
    await archiveProductMedia(client, { productId: "p1", mediaId: "m1" }, KEY);
    expect(client.registerProductMedia).toHaveBeenCalledWith({
      productId: "p1",
      bucket: "media",
      path: "p/1.jpg",
      isPrimary: true,
      idempotencyKey: KEY,
    });
    expect(client.archiveProductMedia).toHaveBeenCalledWith({
      productId: "p1",
      mediaId: "m1",
      idempotencyKey: KEY,
    });
  });
});

describe("slugify", () => {
  it("produces a url-safe slug from a name", () => {
    expect(slugify("Summer Tee 2026")).toBe("summer-tee-2026");
    expect(slugify("  Trailing/Leading  ")).toBe("trailing-leading");
    expect(slugify("Café Crème")).toBe("cafe-creme");
    expect(slugify("!!!")).toBe("");
  });
});

describe("validation", () => {
  it("accepts a good name and rejects blank/overlong", () => {
    expect(validateProductName("Tee")).toBeNull();
    expect(validateProductName("   ")).not.toBeNull();
    expect(validateProductName("x".repeat(201))).not.toBeNull();
  });

  it("enforces the canonical slug shape", () => {
    expect(validateSlug("summer-tee")).toBeNull();
    expect(validateSlug("tee2026")).toBeNull();
    for (const bad of ["", "Summer Tee", "-tee", "tee-", "te--e", "TEE", "tée"]) {
      expect(validateSlug(bad)).not.toBeNull();
    }
  });

  it("treats style code as optional but bounded", () => {
    expect(validateStyleCode("")).toBeNull();
    expect(validateStyleCode("ST-100")).toBeNull();
    expect(validateStyleCode("x".repeat(65))).not.toBeNull();
  });

  it("requires a non-blank bounded SKU", () => {
    expect(validateSku("TEE-M")).toBeNull();
    expect(validateSku("")).not.toBeNull();
    expect(validateSku("x".repeat(65))).not.toBeNull();
  });
});
