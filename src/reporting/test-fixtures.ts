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

export function currencySales(currency = "USD"): CurrencySalesGroup {
  return {
    currency,
    sales: {
      grossMinor: 12000,
      discountMinor: 2000,
      netMinor: 10000,
      orders: 4,
      averageOrderValueMinor: 2500,
    },
    returns: {
      acceptedReturnedMinor: 1200,
      succeededRefundedMinor: 900,
      pendingRefundMinor: 300,
      returnCount: 1,
    },
    trend: [
      {
        label: "Sep 1",
        fromInclusive: "2026-09-01T00:00:00+03:00",
        toExclusive: "2026-09-02T00:00:00+03:00",
        netMinor: 10000,
        orders: 4,
      },
    ],
    channels: [
      { id: "pos", label: "POS", grossMinor: 7000, discountMinor: 1000, netMinor: 6000, orders: 2 },
      {
        id: "online",
        label: "Online",
        grossMinor: 5000,
        discountMinor: 1000,
        netMinor: 4000,
        orders: 2,
      },
    ],
    brands: [
      {
        id: "brand-1",
        label: "North Star",
        grossMinor: 12000,
        discountMinor: 2000,
        netMinor: 10000,
        orders: 4,
      },
    ],
    posBranches: [
      {
        id: "branch-1",
        label: "Downtown",
        grossMinor: 7000,
        discountMinor: 1000,
        netMinor: 6000,
        orders: 2,
      },
    ],
    posRegisters: [
      {
        id: "register-1",
        label: "Register 1",
        grossMinor: 7000,
        discountMinor: 1000,
        netMinor: 6000,
        orders: 2,
      },
    ],
    posOperators: [
      {
        id: "operator-1",
        label: "Mona",
        grossMinor: 7000,
        discountMinor: 1000,
        netMinor: 6000,
        orders: 2,
      },
    ],
  };
}

export function dashboardReport(): DashboardReport {
  return {
    meta: REPORT_META,
    currencies: [currencySales("USD"), currencySales("EUR")],
    topProducts: [
      {
        id: "p1",
        productName: "Linen Shirt",
        currency: "USD",
        unitsSold: 4,
        grossMinor: 12000,
        discountMinor: 2000,
        netMinor: 10000,
      },
      {
        id: "p2",
        productName: "Canvas Tote",
        currency: "EUR",
        unitsSold: 2,
        grossMinor: 6000,
        discountMinor: 1000,
        netMinor: 5000,
      },
    ],
    inventoryExceptions: [
      {
        id: "i1",
        productName: "Linen Shirt",
        variantName: "Medium",
        inventoryLocationName: "Flagship Stockroom",
        onHand: 0,
        label: "No stock currently on hand",
      },
    ],
  };
}

export function fakeReportingAdapter(overrides: Partial<ReportingAdapter> = {}): ReportingAdapter {
  const productRow = {
    id: "p1",
    productName: "Linen Shirt",
    variantName: "Medium",
    sku: "LS-M",
    currency: "USD",
    unitsSold: 4,
    grossMinor: 12000,
    discountMinor: 2000,
    netMinor: 10000,
    noSalesWithCurrentStock: true,
  };
  return {
    getDashboard: async () => dashboardReport(),
    getSales: async (): Promise<SalesReport> => ({
      meta: REPORT_META,
      currencies: [currencySales()],
    }),
    getProductSales: async (_query, ranking): Promise<ProductSalesReport> => ({
      meta: REPORT_META,
      ranking,
      items: { items: [productRow], nextCursor: "page-2" },
    }),
    getInventory: async (): Promise<InventoryReport> => ({
      meta: REPORT_META,
      balances: [
        {
          id: "b1",
          productName: "Linen Shirt",
          variantName: "Medium",
          inventoryLocationName: "Flagship Stockroom",
          onHand: 9,
        },
      ],
      movements: {
        items: [
          {
            id: "m1",
            occurredAt: "2026-09-02T10:00:00Z",
            kind: "receipt",
            productName: "Linen Shirt",
            variantName: "Medium",
            quantity: 5,
            inventoryLocationName: "Flagship Stockroom",
          },
          {
            id: "m2",
            occurredAt: "2026-09-03T10:00:00Z",
            kind: "transfer",
            productName: "Linen Shirt",
            variantName: "Medium",
            quantity: 2,
            inventoryLocationName: "Flagship Stockroom",
            relatedInventoryLocationName: "Overflow Stockroom",
          },
          {
            id: "m3",
            occurredAt: "2026-09-04T10:00:00Z",
            kind: "adjustment",
            productName: "Linen Shirt",
            variantName: "Medium",
            quantity: -1,
            inventoryLocationName: "Flagship Stockroom",
          },
        ],
        nextCursor: "next-movements",
      },
    }),
    getReturns: async (): Promise<ReturnsReport> => ({
      meta: REPORT_META,
      currencies: [{ currency: "USD", metrics: currencySales().returns }],
      products: {
        items: [{ ...productRow, returnedUnits: 1, disposition: "restock" }],
        nextCursor: "next-returns",
      },
    }),
    getPromotions: async (): Promise<PromotionsReport> => ({
      meta: REPORT_META,
      promotions: {
        items: [
          {
            id: "promo-1",
            promotionName: "Autumn offer",
            currency: "USD",
            redemptions: 3,
            discountMinor: 1500,
            associatedOrders: 3,
            grossMinor: 10000,
            netMinor: 8500,
          },
        ],
        nextCursor: "next-promotions",
      },
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
