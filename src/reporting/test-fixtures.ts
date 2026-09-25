import type { ReportingAdapter } from "./adapter";
import type {
  CurrencySalesGroup,
  DashboardReport,
  InventoryReport,
  ProductSalesReport,
  PromotionsReport,
  ReportMeta,
  ReturnsReport,
  SalesReport,
  SuppliersReport,
} from "./model";

export const REPORT_META: ReportMeta = {
  timezone: "Africa/Cairo",
  fromInclusive: "2026-09-01T00:00:00+03:00",
  toExclusive: "2026-09-08T00:00:00+03:00",
};

const breakdown = {
  id: "row-1",
  label: "Downtown",
  grossMinor: 12_000,
  discountMinor: 2_000,
  netMinor: 10_000,
  orders: 4,
};

export function currencySales(currency = "USD"): CurrencySalesGroup {
  return {
    currency,
    sales: {
      grossMinor: 12_000,
      discountMinor: 2_000,
      netMinor: 10_000,
      orders: 4,
      averageOrderValueMinor: 2_500,
    },
    returns: {
      acceptedReturnedMinor: 1_200,
      succeededRefundedMinor: 900,
      pendingRefundMinor: 300,
      returnCount: 1,
    },
    trend: [
      {
        label: "2026-09-01T00:00:00+03:00",
        fromInclusive: "2026-09-01T00:00:00+03:00",
        netMinor: 10_000,
        orders: 4,
      },
    ],
    channels: [
      { ...breakdown, id: "pos", label: "POS" },
      { ...breakdown, id: "online", label: "Online" },
    ],
    brands: [{ ...breakdown, id: "brand-1", label: "North Star" }],
  };
}

export function dashboardReport(): DashboardReport {
  return {
    meta: REPORT_META,
    currencies: [currencySales("USD"), currencySales("EUR")],
    stock: { totalOnHand: 73, variantCount: 3, locationCount: 2, asOf: "2026-09-08T10:00:00Z" },
    topProducts: [
      {
        id: "p1",
        productName: "Linen Shirt",
        currency: "USD",
        unitsSold: 4,
        grossMinor: 12_000,
        discountMinor: 2_000,
        netMinor: 10_000,
      },
      {
        id: "p2",
        productName: "Canvas Tote",
        currency: "EUR",
        unitsSold: 2,
        grossMinor: 6_000,
        discountMinor: 1_000,
        netMinor: 5_000,
      },
    ],
    noSalesWithCurrentStock: [
      { id: "v1", productName: "Linen Shirt", variantId: "v1", sku: "LS-M", currentOnHand: 9 },
    ],
  };
}

export function fakeReportingAdapter(overrides: Partial<ReportingAdapter> = {}): ReportingAdapter {
  return {
    getDashboard: async () => dashboardReport(),
    getSales: async (_query, view): Promise<SalesReport> => ({
      meta: REPORT_META,
      view,
      currencies: [
        {
          currency: "USD",
          trend: view === "trend" ? currencySales().trend : [],
          rows: view === "trend" ? [] : [{ ...breakdown, label: "Downtown" }],
        },
      ],
    }),
    getProductSales: async (_query, ranking, view): Promise<ProductSalesReport> => ({
      meta: REPORT_META,
      ranking,
      view,
      items: {
        items:
          view === "sales"
            ? [
                {
                  id: "p1",
                  productName: "Linen Shirt",
                  variantId: ranking === "variant" ? "variant-1" : undefined,
                  sku: ranking === "variant" ? "LS-M" : undefined,
                  currency: "USD",
                  unitsSold: 4,
                  grossMinor: 12_000,
                  discountMinor: 2_000,
                  netMinor: 10_000,
                },
              ]
            : [
                {
                  id: "p1",
                  productName: "Linen Shirt",
                  variantId: "variant-1",
                  sku: "LS-M",
                  currentOnHand: 9,
                },
              ],
        nextCursor: "page-2",
      },
    }),
    getInventory: async (_query, view): Promise<InventoryReport> => ({
      meta: view === "balances" ? null : REPORT_META,
      asOf: view === "balances" ? "2026-09-08T10:00:00Z" : null,
      view,
      items: {
        items:
          view === "balances"
            ? [
                {
                  id: "b1",
                  productName: "Linen Shirt",
                  variantId: "variant-1",
                  sku: "LS-M",
                  inventoryLocationName: "Flagship Stockroom",
                  onHand: 9,
                },
              ]
            : [
                {
                  id: "op1",
                  operationType: view,
                  occurredAt: "2026-09-02T10:00:00Z",
                  supplierName: view === "receipts" ? "Nile Textiles" : undefined,
                  lineCount: 1,
                  unitsIn: view === "receipts" || view === "transfers" ? 5 : 0,
                  unitsOut: view === "transfers" || view === "adjustments" ? 2 : 0,
                },
              ],
        nextCursor: "next-inventory",
      },
    }),
    getReturns: async (_query, ranking): Promise<ReturnsReport> => ({
      meta: REPORT_META,
      ranking,
      currencies: [{ currency: "USD", metrics: currencySales().returns }],
      dispositions: [{ disposition: "restock", returnedUnits: 1 }],
      products: {
        items: [
          {
            id: "p1",
            productName: "Linen Shirt",
            currency: "USD",
            returnedUnits: 1,
            acceptedReturnedMinor: 1_200,
          },
        ],
        nextCursor: "next-returns",
      },
    }),
    getPromotions: async (): Promise<PromotionsReport> => ({
      meta: REPORT_META,
      promotions: [
        {
          id: "promo-1",
          promotionName: "Autumn offer",
          currency: "USD",
          redemptions: 3,
          discountMinor: 1_500,
          associatedOrders: 3,
          grossMinor: 10_000,
          netMinor: 8_500,
          cancelledOrders: 1,
        },
      ],
    }),
    getSuppliers: async (): Promise<SuppliersReport> => ({
      meta: REPORT_META,
      suppliers: {
        items: [
          {
            id: "supplier-1",
            supplierName: "Nile Textiles",
            receiptCount: 2,
            unitsReceived: 40,
            lastReceiptAt: "2026-09-05T10:00:00Z",
          },
        ],
        nextCursor: "next-suppliers",
      },
    }),
    ...overrides,
  };
}
