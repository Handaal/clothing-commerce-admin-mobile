import type {
  AdjustInventoryResponse,
  CreateVariantResponse,
  InventoryListResponse,
  MediaUploadIntentResponse,
  MeContextResponse,
  MeTenantsResponse,
  OrderDetailResponse,
  OrderCommerceDetails,
  OrderListResponse,
  OrderReturnSummary,
  ProductDetailResponse,
  ProductListResponse,
  ProductWriteResponse,
  PromotionDetail,
  PromotionSummary,
  PublicProductDetailResponse,
  PublishProductResponse,
  ReceiveInventoryResponse,
  RegisterProductMediaResponse,
  ReturnDetailResponse,
  ReturnEligibilityResponse,
  ReturnHistoryResponse,
  SetVariantPriceResponse,
  Supplier as SdkSupplier,
  SupplierDue,
  SupplierListResponse,
  SupplierPayment,
  SupplierPurchase,
  SupplierPurchaseItem,
  SupplierReceipt as SdkSupplierReceipt,
  SupplierReceiptsResponse,
  SupplierReminder,
  SupplierSummary as SdkSupplierSummary,
  AssignableStaffRole as SdkAssignableStaffRole,
  AssignableStaffRolesResponse as SdkAssignableStaffRolesResponse,
  AssignableStaffScope as SdkAssignableStaffScope,
  AssignableStaffScopesResponse as SdkAssignableStaffScopesResponse,
  EligibleIdentitiesResponse as SdkEligibleIdentitiesResponse,
  EligibleIdentity as SdkEligibleIdentity,
  StaffAssignment as SdkStaffAssignment,
  StaffDetail as SdkStaffDetail,
  StaffListResponse as SdkStaffListResponse,
  StaffSummary as SdkStaffSummary,
  TransferInventoryResponse,
  UnpublishProductResponse,
} from "@shifted/clothing-commerce-sdk";

import type { CursorPage } from "../commerce/pagination";
import type { SupplierAdapter } from "../suppliers/adapter";
import type { Supplier, SupplierReceipt, SupplierSummary } from "../suppliers/model";
import type { StaffAdapter } from "../staff/adapter";
import type {
  AccessScopeOption as StaffScopeOption,
  EligibleIdentity,
  RoleOption as StaffRoleOption,
  StaffAssignment,
  StaffDetail,
  StaffSummary,
} from "../staff/model";

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
  inventory?: Partial<MeContextResponse["access"]["inventory"]>;
  orders?: Partial<MeContextResponse["access"]["orders"]>;
  /** `null` omits the suppliers capability entirely (older server / no access at all). */
  suppliers?: NonNullable<MeContextResponse["access"]["suppliers"]> | null;
  /**
   * Staff capability. `/me/context` now types `access.staff` as `{ canRead, canManage }` (SDK 0.10.0).
   * `null` omits it entirely (older server / no access); default is read+manage so nav + affordances are
   * exercised.
   */
  staff?: NonNullable<MeContextResponse["access"]["staff"]> | null;
  /** `null` omits optional Promotion guidance; default is read+manage for feature tests. */
  promotions?: NonNullable<MeContextResponse["access"]["promotions"]> | null;
}

export function meContext(tenantId: string, overrides: MeContextOverrides = {}): MeContextResponse {
  const access = {
    catalog: { canRead: true, tenantWide: true, brands: [], ...overrides.catalog },
    inventory: {
      canRead: false,
      tenantWide: false,
      locations: [],
      write: { canReceive: false, canAdjust: false, canTransfer: false, locations: [] },
      ...overrides.inventory,
    },
    orders: { canRead: true, tenantWide: false, brands: [], branches: [], ...overrides.orders },
    // Suppliers capability is optional on the real context. Default to read+manage so navigation and
    // management affordances are exercised; pass `suppliers: null` to omit it, or a partial to vary it.
    ...(overrides.suppliers === null
      ? {}
      : { suppliers: overrides.suppliers ?? { canRead: true, canManage: true } }),
    // Staff capability is optional on the real context. Default to read+manage so navigation and
    // management affordances are exercised; pass `staff: null` to omit it, or a partial to vary it.
    ...(overrides.staff === null
      ? {}
      : { staff: overrides.staff ?? { canRead: true, canManage: true } }),
    ...(overrides.promotions === null
      ? {}
      : { promotions: overrides.promotions ?? { canRead: true, canManage: true } }),
  };
  return {
    tenant: { id: tenantId, name: "Acme Apparel", status: "active" },
    membership: { id: MEMBERSHIP_A },
    // Cast at the return boundary because the optional suppliers/staff blocks are built by conditional
    // spread (present-or-absent), which TypeScript widens; every field value is contract-shaped.
    access: access as MeContextResponse["access"],
  };
}

export const BRAND_A = "55555555-5555-4555-8555-555555555555";
export const PRODUCT_A = "66666666-6666-4666-8666-666666666666";
export const VARIANT_A = "77777777-7777-4777-8777-777777777777";
export const PROMOTION_A = "18181818-1818-4818-8818-181818181818";
export const PROMOTION_CODE_A = "19191919-1919-4919-8919-191919191919";

export function promotionSummary(overrides: Partial<PromotionSummary> = {}): PromotionSummary {
  return {
    id: PROMOTION_A,
    name: "Autumn offer",
    status: "active",
    benefitType: "percentage",
    targetType: "order",
    activationType: "automatic",
    channel: null,
    redemptionCount: 2,
    globalRedemptionLimit: 10,
    economicsLocked: true,
    createdAt: "2026-09-25T09:00:00.000Z",
    ...overrides,
  };
}

export function promotionDetail(overrides: Partial<PromotionDetail> = {}): PromotionDetail {
  return {
    ...promotionSummary(),
    description: "Seasonal discount",
    benefitPercentBp: 1000,
    benefitAmountMinor: null,
    benefitCurrency: null,
    minSubtotalMinor: 5000,
    maxDiscountMinor: 2500,
    startsAt: null,
    endsAt: null,
    brandId: null,
    branchId: null,
    remainingRedemptions: 8,
    targets: [],
    codes: [],
    ...overrides,
  };
}

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

export const MEDIA_A = "12121212-1212-4121-8121-121212121212";

// Catalog WRITE responses (SDK 0.6.0). `getProduct` returns no storefrontStatus/slug/description, so
// these write responses are the in-session source of publication state (see catalog/observations).
export function productWriteResponse(
  overrides: Partial<ProductWriteResponse> = {},
): ProductWriteResponse {
  return {
    productId: PRODUCT_A,
    status: "draft",
    storefrontStatus: "unpublished",
    ...overrides,
  };
}

export function publishResponse(
  overrides: Partial<PublishProductResponse> = {},
): PublishProductResponse {
  return {
    productId: PRODUCT_A,
    storefrontStatus: "published",
    publishedAt: "2026-09-17T12:00:00.000Z",
    ...overrides,
  };
}

export function unpublishResponse(
  overrides: Partial<UnpublishProductResponse> = {},
): UnpublishProductResponse {
  return { productId: PRODUCT_A, storefrontStatus: "unpublished", ...overrides };
}

export function createVariantResponse(
  overrides: Partial<CreateVariantResponse> = {},
): CreateVariantResponse {
  return { variantId: VARIANT_A, status: "draft", ...overrides };
}

export function setVariantPriceResponse(
  overrides: Partial<SetVariantPriceResponse> = {},
): SetVariantPriceResponse {
  return {
    priceId: "13131313-1313-4131-8131-131313131313",
    currency: "USD",
    amountMinor: 2599,
    ...overrides,
  };
}

export function mediaUploadIntent(
  overrides: Partial<MediaUploadIntentResponse> = {},
): MediaUploadIntentResponse {
  return {
    bucket: "product-media",
    path: `${TENANT_A}/${PRODUCT_A}/photo.jpg`,
    contentType: "image/jpeg",
    uploadUrl: "https://storage.example/signed-put",
    expiresAt: "2026-09-17T12:05:00.000Z",
    ...overrides,
  };
}

export function registerMediaResponse(
  overrides: Partial<RegisterProductMediaResponse> = {},
): RegisterProductMediaResponse {
  return { mediaId: MEDIA_A, isPrimary: true, ...overrides };
}

export function publicProductDetail(
  overrides: Partial<PublicProductDetailResponse> = {},
): PublicProductDetailResponse {
  return {
    id: PRODUCT_A,
    brandId: BRAND_A,
    slug: "linen-shirt",
    name: "Linen Shirt",
    description: "A soft linen shirt.",
    publishedAt: "2026-09-17T12:00:00.000Z",
    media: [],
    variants: [
      {
        id: VARIANT_A,
        sku: "LS-001-M",
        displayName: "Medium",
        optionSignature: "size:m",
        prices: [{ currency: "USD", amountMinor: 2599 }],
        inStock: true,
      },
    ],
    ...overrides,
  };
}

export const INVENTORY_LOCATION_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const INVENTORY_LOCATION_B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const VARIANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const OPERATION_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

// Inventory WRITE responses (SDK 0.3.1). observed* / version are authoritative post-commit values
// displayed in success states; future adjustments use the next inventory list row's version.
export function receiveResponse(
  overrides: Partial<ReceiveInventoryResponse> = {},
): ReceiveInventoryResponse {
  return {
    operationId: OPERATION_ID,
    variantId: VARIANT_A,
    inventoryLocationId: INVENTORY_LOCATION_A,
    observedOnHand: 27,
    observedVersion: 2,
    ...overrides,
  };
}

export function adjustResponse(
  overrides: Partial<AdjustInventoryResponse> = {},
): AdjustInventoryResponse {
  return {
    operationId: OPERATION_ID,
    changed: true,
    variantId: VARIANT_A,
    inventoryLocationId: INVENTORY_LOCATION_A,
    previousOnHand: 27,
    newOnHand: 25,
    version: 3,
    ...overrides,
  };
}

export function transferResponse(
  overrides: Partial<TransferInventoryResponse> = {},
): TransferInventoryResponse {
  return {
    operationId: OPERATION_ID,
    variantId: VARIANT_A,
    source: { inventoryLocationId: INVENTORY_LOCATION_A, observedOnHand: 20, observedVersion: 3 },
    destination: {
      inventoryLocationId: INVENTORY_LOCATION_B,
      observedOnHand: 5,
      observedVersion: 1,
    },
    ...overrides,
  };
}

export function inventoryItem(
  overrides: Partial<InventoryListResponse["items"][number]> = {},
): InventoryListResponse["items"][number] {
  return {
    inventoryLocationId: INVENTORY_LOCATION_A,
    variantId: VARIANT_A,
    productName: "Linen Shirt",
    sku: "LS-001-M",
    onHand: 22,
    version: 1,
    ...overrides,
  };
}

export function inventoryList(
  items: InventoryListResponse["items"],
  pageInfo: Partial<InventoryListResponse["pageInfo"]> = {},
): InventoryListResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

export const ORDER_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const ORDER_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

export function orderCommerce(overrides: Partial<OrderCommerceDetails> = {}): OrderCommerceDetails {
  return {
    customerId: null,
    customer: { name: "Checkout Guest", phone: "+201001234567", email: "guest@example.com" },
    delivery: {
      recipientName: "Checkout Recipient",
      phone: "+201009876543",
      line1: "10 Example Street",
      line2: "Apartment 2",
      city: "Cairo",
      region: "Cairo Governorate",
      postalCode: "11511",
      countryCode: "EG",
      notes: "Call on arrival",
    },
    payment: {
      method: "cash_on_delivery",
      provider: null,
      status: "pending",
      amountMinor: 12995,
      currency: "USD",
    },
    reservations: [
      {
        variantId: VARIANT_B,
        inventoryLocationId: INVENTORY_LOCATION_A,
        quantity: 2,
        consumedQuantity: 1,
        status: "active",
        expiresAt: null,
      },
    ],
    ...overrides,
  };
}

export function orderListItem(
  overrides: Partial<OrderListResponse["items"][number]> = {},
): OrderListResponse["items"][number] {
  return {
    id: ORDER_A,
    orderNumber: "ORD-1001",
    channel: "online",
    status: "placed",
    brandId: BRAND_A,
    branchId: null,
    currency: "USD",
    totalMinor: 12995,
    placedAt: "2026-09-03T12:00:00.000Z",
    ...overrides,
  };
}

export function orderList(
  items: OrderListResponse["items"],
  pageInfo: Partial<OrderListResponse["pageInfo"]> = {},
): OrderListResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

/**
 * Order Detail shaped like `GET /orders/{id}`. Defaults mirror the domain of the dev fixture (2
 * lines, 5 ordered units, M fully fulfilled, L partially) WITHOUT reusing any real fixture ids.
 */
export function orderDetail(overrides: Partial<OrderDetailResponse> = {}): OrderDetailResponse {
  return {
    header: {
      id: ORDER_A,
      orderNumber: "ORD-1001",
      channel: "online",
      status: "placed",
      brandId: BRAND_A,
      branchId: null,
      currency: "USD",
      totalMinor: 12995,
      placedAt: "2026-09-03T12:00:00.000Z",
    },
    lines: [
      {
        lineNumber: 1,
        variantId: VARIANT_A,
        productName: "Linen Shirt",
        sku: "LS-001-M",
        quantity: 3,
        unitPriceMinor: 2599,
        lineTotalMinor: 7797,
      },
      {
        lineNumber: 2,
        variantId: VARIANT_B,
        productName: "Linen Shirt",
        sku: "LS-001-L",
        quantity: 2,
        unitPriceMinor: 2599,
        lineTotalMinor: 5198,
      },
    ],
    cancellation: null,
    fulfillmentProgress: {
      status: "partially_fulfilled",
      lines: [
        {
          lineNumber: 1,
          variantId: VARIANT_A,
          orderedQuantity: 3,
          fulfilledQuantity: 3,
          status: "fulfilled",
        },
        {
          lineNumber: 2,
          variantId: VARIANT_B,
          orderedQuantity: 2,
          fulfilledQuantity: 1,
          status: "partially_fulfilled",
        },
      ],
    },
    ...overrides,
  };
}

export const RETURN_A = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
export const RETURN_B = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";
export const REFUND_A = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
export const PAYMENT_A = "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4";
export const ORDER_LINE_A = "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5";

/**
 * Order-embedded returns summary as `GET /orders/{id}` returns it (SDK 0.8.0). Present only when the
 * caller also holds return-read scope; keyed by the order's own `lineNumber`.
 */
export function orderReturnSummary(
  overrides: Partial<OrderReturnSummary> = {},
): OrderReturnSummary {
  return {
    lines: [{ orderLineId: ORDER_LINE_A, lineNumber: 1, returnedQuantity: 1 }],
    pendingRefundMinor: 0,
    refundedMinor: 2599,
    ...overrides,
  };
}

/** A single accepted Return with its one Refund, shaped like `GET /returns/{id}`. */
export function returnDetail(overrides: Partial<ReturnDetailResponse> = {}): ReturnDetailResponse {
  return {
    id: RETURN_A,
    orderId: ORDER_A,
    channel: "pos",
    source: "pos",
    actorMembershipId: MEMBERSHIP_A,
    status: "accepted",
    currency: "USD",
    amountMinor: 2599,
    inventoryLocationId: INVENTORY_LOCATION_A,
    inventoryOperationId: OPERATION_ID,
    createdAt: "2026-09-19T10:00:00.000Z",
    lines: [
      {
        orderLineId: ORDER_LINE_A,
        lineNumber: 1,
        variantId: VARIANT_A,
        quantity: 1,
        reason: "Wrong size",
        disposition: "restock",
        amountMinor: 2599,
      },
    ],
    refund: {
      id: REFUND_A,
      paymentId: PAYMENT_A,
      returnId: RETURN_A,
      method: "cash",
      status: "succeeded",
      amountMinor: 2599,
      currency: "USD",
      settlementReference: "till-2026-09-19",
      settledAt: "2026-09-19T10:00:05.000Z",
    },
    ...overrides,
  };
}

export function returnHistory(
  items: ReturnDetailResponse[],
  pageInfo: Partial<ReturnHistoryResponse["pageInfo"]> = {},
): ReturnHistoryResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

/** Server return eligibility for `GET /orders/{id}/return-eligibility`, matching {@link orderDetail}. */
export function returnEligibility(
  overrides: Partial<ReturnEligibilityResponse> = {},
): ReturnEligibilityResponse {
  return {
    orderId: ORDER_A,
    currency: "USD",
    eligible: true,
    reason: null,
    maxRefundableMinor: 12995,
    policy: {
      windowDays: 30,
      allowedReasons: null,
      manualRefundsEnabled: true,
      maxManualRefundMinor: null,
    },
    lines: [
      {
        orderLineId: ORDER_LINE_A,
        lineNumber: 1,
        variantId: VARIANT_A,
        purchasedQuantity: 3,
        fulfilledQuantity: 3,
        returnedQuantity: 0,
        eligibleQuantity: 3,
        unitPriceMinor: 2599,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------------
// Phase 2N Suppliers (foundation only — no Supplier SDK exists yet). These fixtures build the local,
// Admin-owned model and a fake adapter, used ONLY in tests. Production has no adapter and shows the
// unavailable state; nothing here fabricates production supplier data.
// ---------------------------------------------------------------------------------------------------

export const SUPPLIER_A = "a5a5a5a5-a5a5-4a5a-8a5a-a5a5a5a5a5a5";
export const SUPPLIER_B = "b6b6b6b6-b6b6-4b6b-8b6b-b6b6b6b6b6b6";
export const SUPPLIER_RECEIPT_A = "c7c7c7c7-c7c7-4c7c-8c7c-c7c7c7c7c7c7";

export function supplierSummary(overrides: Partial<SupplierSummary> = {}): SupplierSummary {
  return {
    id: SUPPLIER_A,
    name: "Nile Textiles Co.",
    referenceCode: "SUP-001",
    contactPerson: "Mona Adel",
    phone: "+20 10 1234 5678",
    email: "orders@niletextiles.example",
    status: "active",
    ...overrides,
  };
}

export function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: SUPPLIER_A,
    name: "Nile Textiles Co.",
    referenceCode: "SUP-001",
    contactPerson: "Mona Adel",
    phone: "+20 10 1234 5678",
    email: "orders@niletextiles.example",
    address: "12 Corniche El Nil, Cairo, Cairo Governorate, 11511, EG",
    notes: "Primary linen supplier.",
    status: "active",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z",
    ...overrides,
  };
}

export function supplierReceipt(overrides: Partial<SupplierReceipt> = {}): SupplierReceipt {
  return {
    id: SUPPLIER_RECEIPT_A,
    receivedAt: "2026-09-12T10:00:00.000Z",
    locationId: INVENTORY_LOCATION_A,
    locationName: "Flagship Stockroom",
    reference: "GRN-2026-0012",
    actor: MEMBERSHIP_A,
    lines: [{ productName: "Linen Shirt", sku: "LS-001-M", variantId: VARIANT_A, quantity: 20 }],
    ...overrides,
  };
}

function page<T>(items: T[], overrides: Partial<CursorPage<T>["pageInfo"]> = {}): CursorPage<T> {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...overrides } };
}

// ── Supplier accounts-payable ledger fixtures ──────────────────────────────────────────────────
export const SUPPLIER_PURCHASE_A = "e9e9e9e9-e9e9-4e9e-8e9e-e9e9e9e9e9e9";
export const SUPPLIER_PAYMENT_A = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
export const SUPPLIER_REMINDER_A = "a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3";

export function supplierPurchase(overrides: Partial<SupplierPurchase> = {}): SupplierPurchase {
  return {
    id: SUPPLIER_PURCHASE_A,
    supplierId: SUPPLIER_A,
    supplierName: "Nile Textiles Co.",
    supplierCode: "SUP-001",
    inventoryOperationId: OPERATION_ID,
    inventoryLocationId: INVENTORY_LOCATION_A,
    inventoryLocationName: "Flagship Stockroom",
    supplierReference: "PO-2026-0007",
    currency: "USD",
    totalMinor: 50000,
    initialPaidMinor: 20000,
    effectivePaidMinor: 20000,
    outstandingMinor: 30000,
    occurredAt: "2026-09-15T10:00:00.000Z",
    notes: null,
    actorMembershipId: MEMBERSHIP_A,
    createdAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  };
}

export function supplierPurchaseItem(
  overrides: Partial<SupplierPurchaseItem> = {},
): SupplierPurchaseItem {
  return {
    id: "a4a4a4a4-a4a4-4a4a-8a4a-a4a4a4a4a4a4",
    lineNumber: 1,
    variantId: VARIANT_A,
    sku: "LS-001-M",
    productName: "Linen Shirt",
    quantity: 20,
    unitCostMinor: 2500,
    lineTotalMinor: 50000,
    ...overrides,
  };
}

export function supplierPayment(overrides: Partial<SupplierPayment> = {}): SupplierPayment {
  return {
    id: SUPPLIER_PAYMENT_A,
    supplierId: SUPPLIER_A,
    currency: "USD",
    amountMinor: 10000,
    paidAt: "2026-09-20T10:00:00.000Z",
    notes: null,
    actorMembershipId: MEMBERSHIP_A,
    createdAt: "2026-09-20T10:00:00.000Z",
    ...overrides,
  };
}

export function supplierDue(overrides: Partial<SupplierDue> = {}): SupplierDue {
  return {
    supplierId: SUPPLIER_A,
    supplierName: "Nile Textiles Co.",
    supplierCode: "SUP-001",
    supplierStatus: "active",
    currency: "USD",
    purchasedMinor: 50000,
    paidMinor: 20000,
    outstandingMinor: 30000,
    ...overrides,
  };
}

export function supplierReminder(overrides: Partial<SupplierReminder> = {}): SupplierReminder {
  return {
    id: SUPPLIER_REMINDER_A,
    supplierId: SUPPLIER_A,
    supplierName: "Nile Textiles Co.",
    dueDate: "2026-10-01",
    amountMinor: 30000,
    currency: "USD",
    note: "Settle balance",
    leadDays: 3,
    notify: true,
    status: "pending",
    isDue: false,
    isOverdue: false,
    actorMembershipId: MEMBERSHIP_A,
    createdAt: "2026-09-21T10:00:00.000Z",
    updatedAt: "2026-09-21T10:00:00.000Z",
    ...overrides,
  };
}

/**
 * Build a fake {@link SupplierAdapter} for tests. Each method defaults to a schema-valid success and
 * can be overridden per test (including with rejections). This is the test-only stand-in for the
 * future SDK-backed adapter; production still resolves to `null`.
 */
export function fakeSupplierAdapter(overrides: Partial<SupplierAdapter> = {}): SupplierAdapter {
  return {
    listSuppliers: async () => page([supplierSummary()]),
    getSupplier: async () => supplier(),
    createSupplier: async (draft) => supplier({ ...draft, id: SUPPLIER_A }),
    updateSupplier: async (id, draft) => supplier({ ...draft, id }),
    setSupplierStatus: async (id, status) => supplier({ id, status }),
    listSupplierReceipts: async () => page([supplierReceipt()]),
    listSupplierPurchases: async () => page([supplierPurchase()]),
    supplierPurchaseItems: async () => [supplierPurchaseItem()],
    recordSupplierPurchase: async (args) =>
      supplierPurchase({ supplierId: args.supplierId, inventoryLocationId: args.inventoryLocationId }),
    listSupplierPayments: async () => page([supplierPayment()]),
    recordSupplierPayment: async (supplierId, args) =>
      supplierPayment({ supplierId, amountMinor: args.amountMinor }),
    supplierDues: async () => [supplierDue()],
    listSupplierReminders: async () => [supplierReminder()],
    createSupplierReminder: async (args) =>
      supplierReminder({ supplierId: args.supplierId, dueDate: args.dueDate }),
    updateSupplierReminder: async (reminderId, args) =>
      supplierReminder({ id: reminderId, ...(args.status ? { status: args.status } : {}) }),
    deleteSupplierReminder: async () => {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------------
// Phase 2N Suppliers — REAL SDK 0.9.0 DTO fixtures. These are the wire shapes the SDK returns; the
// adapter maps them onto the local model above. Kept separate from the local-model fixtures so adapter
// tests assert the mapping against the actual contract, never against the app's own vocabulary.
// ---------------------------------------------------------------------------------------------------

export function sdkSupplier(overrides: Partial<SdkSupplier> = {}): SdkSupplier {
  return {
    id: SUPPLIER_A,
    tenantId: TENANT_A,
    name: "Nile Textiles Co.",
    code: "SUP-001",
    status: "active",
    contactPerson: "Mona Adel",
    phone: "+20 10 1234 5678",
    email: "orders@niletextiles.example",
    address: "12 Corniche El Nil, Cairo",
    notes: "Primary linen supplier.",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z",
    ...overrides,
  };
}

export function sdkSupplierSummary(
  overrides: Partial<SdkSupplierSummary> = {},
): SdkSupplierSummary {
  return {
    id: SUPPLIER_A,
    tenantId: TENANT_A,
    name: "Nile Textiles Co.",
    code: "SUP-001",
    status: "active",
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z",
    ...overrides,
  };
}

export function sdkSupplierListResponse(
  items: SdkSupplierSummary[] = [sdkSupplierSummary()],
  pageInfo: Partial<SupplierListResponse["pageInfo"]> = {},
): SupplierListResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

export function sdkSupplierReceipt(
  overrides: Partial<SdkSupplierReceipt> = {},
): SdkSupplierReceipt {
  return {
    operationId: SUPPLIER_RECEIPT_A,
    receivedAt: "2026-09-12T10:00:00.000Z",
    supplierId: SUPPLIER_A,
    supplierName: "Nile Textiles Co.",
    supplierCode: "SUP-001",
    supplierReference: "GRN-2026-0012",
    actorMembershipId: MEMBERSHIP_A,
    lines: [
      {
        variantId: VARIANT_A,
        sku: "LS-001-M",
        productName: "Linen Shirt",
        quantity: 20,
        inventoryLocationId: INVENTORY_LOCATION_A,
        inventoryLocationName: "Flagship Stockroom",
        branchId: null,
      },
    ],
    ...overrides,
  };
}

export function sdkSupplierReceiptsResponse(
  items: SdkSupplierReceipt[] = [sdkSupplierReceipt()],
  pageInfo: Partial<SupplierReceiptsResponse["pageInfo"]> = {},
): SupplierReceiptsResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

// ---------------------------------------------------------------------------------------------------
// Phase 2O Staff (foundation only — no Staff SDK is integrated yet). These fixtures build the local,
// Admin-owned model and a fake adapter, used ONLY in tests. Production resolves NO adapter and shows the
// unavailable state; nothing here fabricates production staff data.
// ---------------------------------------------------------------------------------------------------

export const MEMBERSHIP_STAFF_A = "a9a9a9a9-a9a9-4a9a-8a9a-a9a9a9a9a9a9";
export const MEMBERSHIP_STAFF_B = "b8b8b8b8-b8b8-4b8b-8b8b-b8b8b8b8b8b8";
export const IDENTITY_A = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";
export const IDENTITY_B = "d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2";
export const ROLE_MANAGER = "e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3";
export const ROLE_STOCK = "f4f4f4f4-f4f4-4f4f-8f4f-f4f4f4f4f4f4";
export const SCOPE_TENANT = "05050505-0505-4050-8050-050505050505";
export const SCOPE_BRANCH = "16161616-1616-4161-8161-161616161616";
export const ASSIGNMENT_A = "27272727-2727-4272-8272-272727272727";

export function roleOption(overrides: Partial<StaffRoleOption> = {}): StaffRoleOption {
  return {
    id: ROLE_MANAGER,
    label: "Branch Manager",
    permissionSummary: "Manage catalog, inventory and orders",
    ...overrides,
  };
}

export function accessScopeOption(overrides: Partial<StaffScopeOption> = {}): StaffScopeOption {
  return {
    id: SCOPE_BRANCH,
    label: "Downtown Branch",
    kind: "branch",
    targets: ["Branch: Downtown", "Location: Main Stockroom"],
    ...overrides,
  };
}

export function tenantScopeOption(overrides: Partial<StaffScopeOption> = {}): StaffScopeOption {
  return { id: SCOPE_TENANT, label: "Whole business", kind: "tenant", targets: [], ...overrides };
}

export function staffAssignment(overrides: Partial<StaffAssignment> = {}): StaffAssignment {
  return {
    assignmentId: ASSIGNMENT_A,
    role: { id: ROLE_MANAGER, label: "Branch Manager" },
    scope: {
      id: SCOPE_BRANCH,
      label: "Downtown Branch",
      kind: "branch",
      targets: ["Branch: Downtown"],
    },
    ...overrides,
  };
}

export function staffSummary(overrides: Partial<StaffSummary> = {}): StaffSummary {
  return {
    membershipId: MEMBERSHIP_STAFF_A,
    identityId: IDENTITY_A,
    displayName: "Layla Hassan",
    primaryEmail: "layla@acme.example",
    status: "active",
    roleSummaries: [{ id: ROLE_MANAGER, label: "Branch Manager" }],
    scopeSummaries: [{ id: SCOPE_BRANCH, label: "Downtown Branch", kind: "branch", targets: [] }],
    ...overrides,
  };
}

export function staffDetail(overrides: Partial<StaffDetail> = {}): StaffDetail {
  return {
    membershipId: MEMBERSHIP_STAFF_A,
    identity: {
      identityId: IDENTITY_A,
      displayName: "Layla Hassan",
      primaryEmail: "layla@acme.example",
      identityStatus: "active",
    },
    status: "active",
    assignments: [staffAssignment()],
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z",
    ...overrides,
  };
}

export function eligibleIdentity(overrides: Partial<EligibleIdentity> = {}): EligibleIdentity {
  return {
    identityId: IDENTITY_B,
    displayName: "Omar Fathy",
    email: "omar@acme.example",
    identityStatus: "active",
    ...overrides,
  };
}

/**
 * Build a fake {@link StaffAdapter} for tests. Each method defaults to a schema-valid success and can be
 * overridden per test (including with rejections). This is a local-model stand-in used to drive the
 * screens directly; the real SDK-backed adapter (and its DTO mapping) is exercised separately against the
 * `sdk*` DTO fixtures below.
 */
export function fakeStaffAdapter(overrides: Partial<StaffAdapter> = {}): StaffAdapter {
  return {
    listStaff: async () => page([staffSummary()]),
    getStaff: async () => staffDetail(),
    findEligibleIdentitiesByEmail: async () => [eligibleIdentity()],
    createStaffMembership: async (identityId) =>
      staffDetail({
        membershipId: MEMBERSHIP_STAFF_A,
        identity: {
          identityId,
          displayName: "Omar Fathy",
          primaryEmail: "omar@acme.example",
          identityStatus: "active",
        },
        assignments: [],
      }),
    updateMembershipStatus: async (membershipId, status) => staffDetail({ membershipId, status }),
    assignRoleScope: async (membershipId, input) =>
      staffDetail({
        membershipId,
        assignments: [
          staffAssignment({
            role: { id: input.roleId, label: "Assigned Role" },
            scope: { id: input.scopeId, label: "Assigned Scope", kind: "tenant", targets: [] },
          }),
        ],
      }),
    unassignRoleScope: async (membershipId) => staffDetail({ membershipId, assignments: [] }),
    listAssignableRoles: async () => [
      roleOption(),
      roleOption({ id: ROLE_STOCK, label: "Stock Clerk" }),
    ],
    listAssignableScopes: async () => [tenantScopeOption(), accessScopeOption()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------------------------------
// Phase 2O Staff — REAL SDK 0.11.0 DTO fixtures. These are the wire shapes the SDK returns; the adapter
// maps them onto the local model above. Kept separate from the local-model fixtures so adapter tests
// assert the mapping against the actual contract, never against the app's own vocabulary.
// ---------------------------------------------------------------------------------------------------

export function sdkStaffAssignment(
  overrides: Partial<SdkStaffAssignment> = {},
): SdkStaffAssignment {
  return {
    assignmentId: ASSIGNMENT_A,
    roleId: ROLE_MANAGER,
    roleName: "Branch Manager",
    isProtectedRole: false,
    accessScopeId: SCOPE_BRANCH,
    scopeName: "Downtown Branch",
    scopeMode: "explicit",
    targets: [{ kind: "branch", id: "16161616-1616-4161-8161-161616161616" }],
    permissionKeys: ["catalog.read", "orders.read"],
    assignedAt: "2026-09-10T09:00:00.000Z",
    ...overrides,
  };
}

export function sdkStaffSummary(overrides: Partial<SdkStaffSummary> = {}): SdkStaffSummary {
  return {
    membershipId: MEMBERSHIP_STAFF_A,
    identityId: IDENTITY_A,
    tenantId: TENANT_A,
    displayName: "Layla Hassan",
    email: "layla@acme.example",
    status: "active",
    roles: [{ roleId: ROLE_MANAGER, roleName: "Branch Manager", isProtected: false }],
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z",
    ...overrides,
  };
}

export function sdkStaffDetail(overrides: Partial<SdkStaffDetail> = {}): SdkStaffDetail {
  return {
    membershipId: MEMBERSHIP_STAFF_A,
    identityId: IDENTITY_A,
    tenantId: TENANT_A,
    displayName: "Layla Hassan",
    email: "layla@acme.example",
    status: "active",
    roles: [{ roleId: ROLE_MANAGER, roleName: "Branch Manager", isProtected: false }],
    createdAt: "2026-08-01T09:00:00.000Z",
    updatedAt: "2026-09-10T09:00:00.000Z",
    invitedAt: "2026-08-01T09:00:00.000Z",
    activatedAt: "2026-08-01T09:00:00.000Z",
    suspendedAt: null,
    deactivatedAt: null,
    assignments: [sdkStaffAssignment()],
    ...overrides,
  };
}

export function sdkStaffListResponse(
  items: SdkStaffSummary[] = [sdkStaffSummary()],
  pageInfo: Partial<SdkStaffListResponse["pageInfo"]> = {},
): SdkStaffListResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

export function sdkEligibleIdentity(
  overrides: Partial<SdkEligibleIdentity> = {},
): SdkEligibleIdentity {
  return {
    identityId: IDENTITY_B,
    displayName: "Omar Fathy",
    primaryEmail: "omar@acme.example",
    status: "active",
    ...overrides,
  };
}

export function sdkEligibleIdentitiesResponse(
  items: SdkEligibleIdentity[] = [sdkEligibleIdentity()],
): SdkEligibleIdentitiesResponse {
  return { items };
}

// ---------------------------------------------------------------------------------------------------
// Phase 2O Staff assignment catalogs — REAL SDK 0.11.0 DTO fixtures. `listAssignableStaffRoles` /
// `listAssignableStaffScopes` return these canonical, server-backed, paged catalogs; the adapter maps
// them onto the local RoleOption / AccessScopeOption. Kept separate from derived data on purpose: a
// catalog entry need never appear on any existing staff member's assignment.
// ---------------------------------------------------------------------------------------------------

export function sdkAssignableStaffRole(
  overrides: Partial<SdkAssignableStaffRole> = {},
): SdkAssignableStaffRole {
  return {
    roleId: ROLE_MANAGER,
    roleName: "Branch Manager",
    description: "Manage catalog, inventory and orders",
    isProtected: false,
    permissionKeys: ["catalog.read", "orders.read"],
    ...overrides,
  };
}

export function sdkAssignableStaffRolesResponse(
  items: SdkAssignableStaffRole[] = [sdkAssignableStaffRole()],
  pageInfo: Partial<SdkAssignableStaffRolesResponse["pageInfo"]> = {},
): SdkAssignableStaffRolesResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

export function sdkAssignableStaffScope(
  overrides: Partial<SdkAssignableStaffScope> = {},
): SdkAssignableStaffScope {
  return {
    accessScopeId: SCOPE_BRANCH,
    scopeName: "Downtown Branch",
    description: null,
    scopeMode: "explicit",
    targets: [{ kind: "branch", id: "16161616-1616-4161-8161-161616161616", name: "Downtown" }],
    ...overrides,
  };
}

export function sdkAssignableStaffScopesResponse(
  items: SdkAssignableStaffScope[] = [sdkAssignableStaffScope()],
  pageInfo: Partial<SdkAssignableStaffScopesResponse["pageInfo"]> = {},
): SdkAssignableStaffScopesResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
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
