import { describe, expect, it, vi } from "vitest";
import type { TenantCommerceClient } from "@shifted/clothing-commerce-sdk";

import { resolveReportingAdapter } from "./adapter";

const period = {
  timezone: "Africa/Cairo",
  fromInclusive: "2026-09-01T00:00:00+03:00",
  toExclusive: "2026-10-01T00:00:00+03:00",
};
const query = { range: { preset: "custom", from: "2026-09-01", to: "2026-09-30" } as const };

function clientFixture() {
  const getReportSummary = vi.fn(async () => ({
    period,
    salesByCurrency: [
      {
        currency: "USD",
        grossSalesMinor: 12_000,
        discountsMinor: 2_000,
        netSalesMinor: 10_000,
        orderCount: 4,
        averageOrderValueMinor: 2_500,
      },
      {
        currency: "EUR",
        grossSalesMinor: 7_000,
        discountsMinor: 500,
        netSalesMinor: 6_500,
        orderCount: 2,
        averageOrderValueMinor: 3_250,
      },
    ],
    returns: {
      byCurrency: [{ currency: "USD", acceptedReturnedValueMinor: 1_200, returnCount: 1 }],
      refundsByCurrency: [{ currency: "USD", succeededRefundMinor: 900, pendingRefundMinor: 300 }],
    },
    stock: { totalOnHandQuantity: 73, variantCount: 3, locationCount: 2 },
    inventoryAsOf: "2026-09-30T20:00:00Z",
  }));
  const getSalesReport = vi.fn(async ({ view }: { view?: string }) => ({
    period,
    view: view ?? "trend",
    bucket: view === "trend" ? "day" : null,
    items:
      view === "trend"
        ? [
            {
              currency: "USD",
              grossSalesMinor: 12_000,
              discountsMinor: 2_000,
              netSalesMinor: 10_000,
              orderCount: 4,
              bucketStart: "2026-09-01T00:00:00+03:00",
            },
          ]
        : [
            {
              currency: "USD",
              grossSalesMinor: 12_000,
              discountsMinor: 2_000,
              netSalesMinor: 10_000,
              orderCount: 4,
              ...(view === "channel" ? { channel: "online" } : {}),
              ...(view === "brand" ? { brandId: "brand-1", brandName: "North Star" } : {}),
              ...(view === "pos_branch" ? { branchId: "branch-1", branchName: "Downtown" } : {}),
              ...(view === "pos_register"
                ? { registerId: "register-1", registerName: "Register 1" }
                : {}),
              ...(view === "pos_operator"
                ? { membershipId: "member-1", operatorName: "Mona" }
                : {}),
            },
          ],
  }));
  const getProductsReport = vi.fn(async ({ view, level }: { view?: string; level?: string }) => ({
    period,
    level: level ?? "product",
    view: view ?? "sales",
    items:
      view === "no_sales_with_current_stock"
        ? [
            {
              productId: "product-1",
              productName: "Linen Shirt",
              variantId: "variant-1",
              sku: "LS-M",
              onHandQuantity: 9,
            },
          ]
        : [
            {
              productId: "product-1",
              productName: "Linen Shirt",
              currency: "USD",
              unitsSold: 4,
              grossSalesMinor: 12_000,
              allocatedDiscountsMinor: 2_000,
              netSalesMinor: 10_000,
            },
          ],
    pageInfo: { nextCursor: "products-next", hasMore: true },
  }));
  const getInventoryReport = vi.fn(async ({ view }: { view?: string } = {}) => ({
    period: view === "balances" ? null : period,
    view: view ?? "balances",
    items:
      view === "balances"
        ? [
            {
              variantId: "variant-1",
              sku: "LS-M",
              productId: "product-1",
              productName: "Linen Shirt",
              inventoryLocationId: "location-1",
              locationName: "Flagship Stockroom",
              branchId: "branch-1",
              onHandQuantity: 9,
              version: 2,
            },
          ]
        : [
            {
              operationId: "operation-1",
              operationType: view,
              occurredAt: "2026-09-02T10:00:00Z",
              supplierId: "supplier-1",
              supplierName: "Nile Textiles",
              lineCount: 2,
              unitsIn: 8,
              unitsOut: 0,
            },
          ],
    asOf: view === "balances" ? "2026-09-30T20:00:00Z" : null,
    pageInfo: { nextCursor: "inventory-next", hasMore: true },
  }));
  const getReturnsReport = vi.fn(async ({ view }: { view?: string }) => ({
    period,
    view: view ?? "summary",
    ...(view === "summary"
      ? {
          summary: {
            byCurrency: [
              {
                currency: "USD",
                acceptedReturnedValueMinor: 1_200,
                returnCount: 1,
                succeededRefundMinor: 900,
                pendingRefundMinor: 300,
              },
            ],
            byDisposition: [{ disposition: "restock", returnedQuantity: 1 }],
          },
        }
      : {
          items: [
            {
              productId: "product-1",
              productName: "Linen Shirt",
              variantId: view === "variants" ? "variant-1" : undefined,
              sku: view === "variants" ? "LS-M" : undefined,
              currency: "USD",
              returnedQuantity: 1,
              returnedValueMinor: 1_200,
            },
          ],
          pageInfo: { nextCursor: "returns-next", hasMore: true },
        }),
  }));
  const getPromotionsReport = vi.fn(async () => ({
    period,
    items: [
      {
        promotionId: "promotion-1",
        promotionName: "Autumn offer",
        codeSnapshot: null,
        currency: "USD",
        redemptionCount: 3,
        discountAmountMinor: 1_500,
        orderCount: 3,
        grossSalesMinor: 10_000,
        netSalesMinor: 8_500,
        cancelledOrderCount: 1,
      },
    ],
  }));
  const getSuppliersReport = vi.fn(async () => ({
    period,
    items: [
      {
        supplierId: "supplier-1",
        supplierName: null,
        supplierNameSnapshot: "Nile Textiles at receipt",
        receiptCount: 2,
        unitsReceived: 40,
        lastReceiptAt: "2026-09-05T10:00:00Z",
      },
    ],
    pageInfo: { nextCursor: "suppliers-next", hasMore: true },
  }));

  return {
    client: {
      tenantId: "tenant-1",
      getReportSummary,
      getSalesReport,
      getProductsReport,
      getInventoryReport,
      getReturnsReport,
      getPromotionsReport,
      getSuppliersReport,
    } as unknown as TenantCommerceClient,
    methods: {
      getReportSummary,
      getSalesReport,
      getProductsReport,
      getInventoryReport,
      getReturnsReport,
      getPromotionsReport,
      getSuppliersReport,
    },
  };
}

describe("SDK 0.13.0 reporting adapter", () => {
  it("maps dashboard summary without combining currencies and preserves server time metadata", async () => {
    const { client, methods } = clientFixture();
    const result = await resolveReportingAdapter(client).getDashboard(query);

    expect(result.meta).toEqual(period);
    expect(result.currencies.map((group) => group.currency)).toEqual(["EUR", "USD"]);
    expect(result.currencies.find((group) => group.currency === "USD")?.sales.netMinor).toBe(
      10_000,
    );
    expect(result.currencies.find((group) => group.currency === "EUR")?.sales.netMinor).toBe(6_500);
    expect(result.stock).toEqual({
      totalOnHand: 73,
      variantCount: 3,
      locationCount: 2,
      asOf: "2026-09-30T20:00:00Z",
    });
    expect(result.topProducts[0]?.productName).toBe("Linen Shirt");
    expect(result.noSalesWithCurrentStock[0]?.currentOnHand).toBe(9);
    expect(methods.getReportSummary).toHaveBeenCalledWith({
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it("binds every canonical sales view and keeps POS branch attribution explicit", async () => {
    const { client, methods } = clientFixture();
    const adapter = resolveReportingAdapter(client);
    for (const view of [
      "trend",
      "channel",
      "brand",
      "pos_branch",
      "pos_register",
      "pos_operator",
    ] as const) {
      const result = await adapter.getSales(query, view);
      expect(result.view).toBe(view);
      expect(result.currencies[0]?.currency).toBe("USD");
    }
    expect((await adapter.getSales(query, "pos_branch")).currencies[0]?.rows[0]).toMatchObject({
      id: "branch-1",
      label: "Downtown",
    });
    expect(methods.getSalesReport).toHaveBeenCalledWith(
      expect.objectContaining({ view: "pos_branch" }),
    );
  });

  it("maps Product/Variant datasets and passes opaque cursors one page at a time", async () => {
    const { client, methods } = clientFixture();
    const result = await resolveReportingAdapter(client).getProductSales(
      { ...query, cursor: "opaque-products" },
      "variant",
      "no_sales_with_current_stock",
    );
    expect(result.items).toEqual({
      items: [expect.objectContaining({ id: "variant-1", sku: "LS-M", currentOnHand: 9 })],
      nextCursor: "products-next",
    });
    expect(methods.getProductsReport).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "opaque-products", level: "variant", limit: 50 }),
    );
  });

  it("maps balances and operation-level inventory views without inventing locations", async () => {
    const { client, methods } = clientFixture();
    const adapter = resolveReportingAdapter(client);
    const balances = await adapter.getInventory(query, "balances");
    expect(balances.meta).toBeNull();
    expect(balances.asOf).toBe("2026-09-30T20:00:00Z");
    expect(balances.items.items[0]).toMatchObject({
      productName: "Linen Shirt",
      inventoryLocationName: "Flagship Stockroom",
      onHand: 9,
    });
    expect(methods.getInventoryReport).toHaveBeenCalledWith({
      view: "balances",
      limit: 50,
      cursor: undefined,
    });

    for (const view of ["movements", "receipts", "transfers", "adjustments"] as const) {
      const result = await adapter.getInventory({ ...query, cursor: "opaque-inventory" }, view);
      expect(result.view).toBe(view);
      expect(result.items.nextCursor).toBe("inventory-next");
      expect(result.items.items[0]?.inventoryLocationName).toBeUndefined();
    }
  });

  it("maps Returns, Promotions, and Suppliers using canonical summary and page semantics", async () => {
    const { client, methods } = clientFixture();
    const adapter = resolveReportingAdapter(client);
    const returns = await adapter.getReturns({ ...query, cursor: "opaque-returns" }, "variant");
    expect(returns.currencies[0]?.metrics).toEqual({
      acceptedReturnedMinor: 1_200,
      succeededRefundedMinor: 900,
      pendingRefundMinor: 300,
      returnCount: 1,
    });
    expect(returns.dispositions).toEqual([{ disposition: "restock", returnedUnits: 1 }]);
    expect(returns.products.items[0]).toMatchObject({
      variantId: "variant-1",
      acceptedReturnedMinor: 1_200,
    });
    expect(methods.getReturnsReport).toHaveBeenCalledWith(
      expect.objectContaining({ view: "variants", cursor: "opaque-returns" }),
    );

    const promotions = await adapter.getPromotions(query);
    expect(promotions.promotions[0]).toMatchObject({
      redemptions: 3,
      associatedOrders: 3,
      cancelledOrders: 1,
    });

    const suppliers = await adapter.getSuppliers({ ...query, cursor: "opaque-suppliers" });
    expect(suppliers.suppliers).toEqual({
      items: [expect.objectContaining({ supplierName: "Nile Textiles at receipt" })],
      nextCursor: "suppliers-next",
    });
    expect(methods.getSuppliersReport).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: "opaque-suppliers" }),
    );
  });
});
