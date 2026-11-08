import type {
  ArchiveProductMediaResponse,
  CreateVariantResponse,
  MediaUploadIntentResponse,
  ProductUpdatedResponse,
  ProductWriteResponse,
  PublishProductResponse,
  RegisterProductMediaResponse,
  SetVariantPriceResponse,
  TenantCommerceClient,
  UnpublishProductResponse,
} from "@shifted/clothing-commerce-sdk";

import { t } from "../i18n";

/**
 * The product lifecycle status. The SDK exposes it structurally (on responses) but does not export a
 * standalone `ProductStatus` type, so we derive the canonical union here for the whole catalog surface.
 */
export type ProductStatus = ProductWriteResponse["status"];

/**
 * Pure producers for the Phase 2K catalog writes. Each takes the tenant-scoped SDK client, the business
 * args, and (where the contract requires one) the idempotency key, and returns the SDK response
 * verbatim. They add no headers, issue no direct `fetch`, and invent no contract fields — the SDK owns
 * the transport, the `X-Tenant-Id` header, and the `Idempotency-Key` header. Kept React-free so they
 * are unit-testable in isolation and can be wrapped by `useMutation`.
 *
 * Note: `createProductMediaUploadIntent` is the one catalog write with NO idempotency key in the
 * contract (it mints a server-controlled destination and is safe to repeat), so its producer takes no
 * key. Every other producer threads the caller's stable key through.
 */

export type CreateProductClient = Pick<TenantCommerceClient, "createProduct">;
export type UpdateProductClient = Pick<TenantCommerceClient, "updateProduct">;
export type SetProductStatusClient = Pick<TenantCommerceClient, "setProductStatus">;
export type PublishClient = Pick<TenantCommerceClient, "publishProduct" | "unpublishProduct">;
export type CreateVariantClient = Pick<TenantCommerceClient, "createVariant">;
export type SetVariantPriceClient = Pick<TenantCommerceClient, "setVariantPrice">;
export type CreateMediaIntentClient = Pick<TenantCommerceClient, "createProductMediaUploadIntent">;
export type RegisterMediaClient = Pick<TenantCommerceClient, "registerProductMedia">;
export type ArchiveMediaClient = Pick<TenantCommerceClient, "archiveProductMedia">;

export interface CreateProductArgs {
  brandId: string;
  name: string;
  slug: string;
  styleCode?: string;
  description?: string;
}

export interface UpdateProductArgs {
  productId: string;
  name: string;
  slug: string;
  styleCode?: string;
  description?: string;
}

export interface SetProductStatusArgs {
  productId: string;
  status: ProductStatus;
  archiveReason?: string;
}

export interface CreateVariantArgs {
  productId: string;
  sku: string;
  displayName?: string;
}

export interface SetVariantPriceArgs {
  variantId: string;
  currency: string;
  amountMinor: number;
}

export function createProduct(
  client: CreateProductClient,
  args: CreateProductArgs,
  idempotencyKey: string,
): Promise<ProductWriteResponse> {
  return client.createProduct({ ...args, idempotencyKey });
}

export function updateProduct(
  client: UpdateProductClient,
  args: UpdateProductArgs,
  idempotencyKey: string,
): Promise<ProductUpdatedResponse> {
  return client.updateProduct({ ...args, idempotencyKey });
}

export function setProductStatus(
  client: SetProductStatusClient,
  args: SetProductStatusArgs,
  idempotencyKey: string,
): Promise<ProductWriteResponse> {
  return client.setProductStatus({ ...args, idempotencyKey });
}

export function publishProduct(
  client: PublishClient,
  productId: string,
  idempotencyKey: string,
): Promise<PublishProductResponse> {
  return client.publishProduct({ productId, idempotencyKey });
}

export function unpublishProduct(
  client: PublishClient,
  productId: string,
  idempotencyKey: string,
): Promise<UnpublishProductResponse> {
  return client.unpublishProduct({ productId, idempotencyKey });
}

export function createVariant(
  client: CreateVariantClient,
  args: CreateVariantArgs,
  idempotencyKey: string,
): Promise<CreateVariantResponse> {
  return client.createVariant({ ...args, idempotencyKey });
}

export function setVariantPrice(
  client: SetVariantPriceClient,
  args: SetVariantPriceArgs,
  idempotencyKey: string,
): Promise<SetVariantPriceResponse> {
  return client.setVariantPrice({ ...args, idempotencyKey });
}

export interface RegisterMediaArgs {
  productId: string;
  variantId?: string;
  bucket: string;
  path: string;
  altText?: string;
  position?: number;
  isPrimary?: boolean;
}

/** Upload intent carries no idempotency key in the contract — the API mints a fresh destination. */
export function createMediaUploadIntent(
  client: CreateMediaIntentClient,
  args: {
    productId: string;
    variantId?: string;
    contentType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
    fileName?: string;
  },
): Promise<MediaUploadIntentResponse> {
  return client.createProductMediaUploadIntent(args);
}

export function registerProductMedia(
  client: RegisterMediaClient,
  args: RegisterMediaArgs,
  idempotencyKey: string,
): Promise<RegisterProductMediaResponse> {
  return client.registerProductMedia({ ...args, idempotencyKey });
}

export function archiveProductMedia(
  client: ArchiveMediaClient,
  args: { productId: string; mediaId: string },
  idempotencyKey: string,
): Promise<ArchiveProductMediaResponse> {
  return client.archiveProductMedia({ ...args, idempotencyKey });
}

// ---------------------------------------------------------------------------------------------------
// Local, pre-submit validation. UX convenience only — the API is authoritative and re-checks every
// rule server-side (and owns uniqueness of slug/style code/SKU). `null` means "no local objection".
// ---------------------------------------------------------------------------------------------------

const MAX_NAME_LENGTH = 200;
const MAX_STYLE_CODE_LENGTH = 64;
const MAX_SKU_LENGTH = 64;

/** Derive a URL-safe slug candidate from a product name. The manager can override it. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^ -~]/g, "") // keep printable ASCII only (drops combining marks from NFKD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics become single hyphens
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, 80);
}

export function validateProductName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return t("validate.productName");
  if (trimmed.length > MAX_NAME_LENGTH) return t("validate.nameLength", { max: MAX_NAME_LENGTH });
  return null;
}

/** Lowercase letters, digits, and single internal hyphens — the canonical storefront slug shape. */
export function validateSlug(slug: string): string | null {
  const trimmed = slug.trim();
  if (trimmed === "") return t("validate.slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
    return t("validate.slugFormat");
  }
  return null;
}

/** Style code is optional at the contract level; when present it must be non-blank and bounded. */
export function validateStyleCode(styleCode: string): string | null {
  const trimmed = styleCode.trim();
  if (trimmed === "") return null; // optional
  if (trimmed.length > MAX_STYLE_CODE_LENGTH) {
    return t("validate.styleCodeLength", { max: MAX_STYLE_CODE_LENGTH });
  }
  return null;
}

export function validateSku(sku: string): string | null {
  const trimmed = sku.trim();
  if (trimmed === "") return t("validate.sku");
  if (trimmed.length > MAX_SKU_LENGTH) return t("validate.skuLength", { max: MAX_SKU_LENGTH });
  return null;
}
