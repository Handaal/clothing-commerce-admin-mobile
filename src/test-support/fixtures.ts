import type {
  MeContextResponse,
  MeTenantsResponse,
  ProductDetailResponse,
  ProductListResponse,
} from "@shifted/clothing-commerce-sdk";

// Deterministic, schema-valid fixtures for the SDK contracts (UUIDs must be valid v4-shaped strings).
export const TENANT_A = "11111111-1111-4111-8111-111111111111";
export const TENANT_B = "22222222-2222-4222-8222-222222222222";
export const MEMBERSHIP_A = "33333333-3333-4333-8333-333333333333";
export const MEMBERSHIP_B = "44444444-4444-4444-8444-444444444444";

export function tenant(id: string, name: string, membershipId: string): MeTenantsResponse[number] {
  return { tenantId: id, tenantName: name, membershipId };
}

export interface MeContextOverrides {
  catalog?: Partial<MeContextResponse["access"]["catalog"]>;
}

export function meContext(tenantId: string, overrides: MeContextOverrides = {}): MeContextResponse {
  return {
    tenant: { id: tenantId, name: "Acme Apparel", status: "active" },
    membership: { id: MEMBERSHIP_A },
    access: {
      catalog: { canRead: true, tenantWide: true, brands: [], ...overrides.catalog },
      inventory: { canRead: false, tenantWide: false, locations: [] },
      orders: { canRead: true, tenantWide: false, brands: [], branches: [] },
    },
  };
}

export const BRAND_A = "55555555-5555-4555-8555-555555555555";
export const PRODUCT_A = "66666666-6666-4666-8666-666666666666";
export const VARIANT_A = "77777777-7777-4777-8777-777777777777";

export function productListItem(
  id: string,
  name: string,
  overrides: Partial<ProductListResponse["items"][number]> = {},
): ProductListResponse["items"][number] {
  return { id, name, styleCode: null, status: "active", brandId: BRAND_A, ...overrides };
}

export function productList(
  items: ProductListResponse["items"],
  pageInfo: Partial<ProductListResponse["pageInfo"]> = {},
): ProductListResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

export function productDetail(
  overrides: Partial<ProductDetailResponse> = {},
): ProductDetailResponse {
  return {
    product: {
      id: PRODUCT_A,
      name: "Linen Shirt",
      styleCode: "LS-001",
      status: "active",
      brandId: BRAND_A,
    },
    variants: [{ id: VARIANT_A, sku: "LS-001-M", displayName: "Medium", status: "active" }],
    options: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        name: "Size",
        values: [{ id: "99999999-9999-4999-8999-999999999999", value: "M" }],
      },
    ],
    prices: [{ variantId: VARIANT_A, currency: "USD", amountMinor: 2599 }],
    ...overrides,
  };
}

export interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * A fetch stub that records requests and returns the given JSON body. Header capture works because
 * the SDK passes a plain object under `init.headers`.
 */
export function recordingFetch(
  body: unknown,
  recorded: RecordedRequest[],
  status = 200,
): typeof globalThis.fetch {
  return (async (url: string, init?: { headers?: Record<string, string> }) => {
    recorded.push({ url: String(url), headers: { ...(init?.headers ?? {}) } });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
}
