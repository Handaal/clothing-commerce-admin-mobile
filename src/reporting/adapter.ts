import type {
  InventoryReportItem,
  ProductReportItem,
  ReportPeriod,
  ReturnsReportItem,
  SalesReportItem,
  SalesView,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";

import { reportPeriodQuery } from "./date-range";
import type {
  CurrencySalesGroup,
  DashboardReport,
  InventoryReport,
  InventoryReportRow,
  InventoryReportView,
  NamedSalesBreakdown,
  PagedReportQuery,
  ProductRankingRow,
  ProductReportView,
  ProductSalesReport,
  PromotionsReport,
  ReportMeta,
  ReportQuery,
  ReturnsReport,
  SalesReport,
  SalesReportCurrencyGroup,
  SalesReportView,
  SuppliersReport,
  TrendPoint,
} from "./model";

const PAGE_SIZE = 50;
const DASHBOARD_SIZE = 10;
const adapterCache = new WeakMap<TenantCommerceClient, ReportingAdapter>();

/** The only reporting transport boundary screens consume. */
export interface ReportingAdapter {
  getDashboard(query: ReportQuery): Promise<DashboardReport>;
  getSales(query: ReportQuery, view: SalesReportView): Promise<SalesReport>;
  getProductSales(
    query: PagedReportQuery,
    ranking: "product" | "variant",
    view: ProductReportView,
  ): Promise<ProductSalesReport>;
  getInventory(query: PagedReportQuery, view: InventoryReportView): Promise<InventoryReport>;
  getReturns(query: PagedReportQuery, ranking: "product" | "variant"): Promise<ReturnsReport>;
  getPromotions(query: ReportQuery): Promise<PromotionsReport>;
  getSuppliers(query: PagedReportQuery): Promise<SuppliersReport>;
}

export function resolveReportingAdapter(client: TenantCommerceClient): ReportingAdapter {
  const cached = adapterCache.get(client);
  if (cached) return cached;
  const adapter: ReportingAdapter = {
    async getDashboard(query) {
      const period = reportPeriodQuery(query.range);
      const [summary, trend, channels, brands, products, noSales] = await Promise.all([
        client.getReportSummary(period),
        client.getSalesReport({ ...period, view: "trend", bucket: "day" }),
        client.getSalesReport({ ...period, view: "channel" }),
        client.getSalesReport({ ...period, view: "brand" }),
        client.getProductsReport({
          ...period,
          level: "product",
          view: "sales",
          limit: DASHBOARD_SIZE,
        }),
        client.getProductsReport({
          ...period,
          level: "variant",
          view: "no_sales_with_current_stock",
          limit: DASHBOARD_SIZE,
        }),
      ]);

      const currencies = new Set<string>();
      for (const row of summary.salesByCurrency) currencies.add(row.currency);
      for (const row of summary.returns.byCurrency) currencies.add(row.currency);
      for (const row of summary.returns.refundsByCurrency) currencies.add(row.currency);
      for (const response of [trend, channels, brands]) {
        for (const row of response.items) currencies.add(row.currency);
      }

      return {
        meta: mapMeta(summary.period),
        currencies: [...currencies].sort().map((currency) => {
          const sales = summary.salesByCurrency.find((row) => row.currency === currency);
          const returns = summary.returns.byCurrency.find((row) => row.currency === currency);
          const refunds = summary.returns.refundsByCurrency.find(
            (row) => row.currency === currency,
          );
          return {
            currency,
            sales: {
              grossMinor: sales?.grossSalesMinor ?? 0,
              discountMinor: sales?.discountsMinor ?? 0,
              netMinor: sales?.netSalesMinor ?? 0,
              orders: sales?.orderCount ?? 0,
              averageOrderValueMinor: sales?.averageOrderValueMinor ?? null,
            },
            returns: {
              acceptedReturnedMinor: returns?.acceptedReturnedValueMinor ?? 0,
              returnCount: returns?.returnCount ?? 0,
              succeededRefundedMinor: refunds?.succeededRefundMinor ?? 0,
              pendingRefundMinor: refunds?.pendingRefundMinor ?? 0,
            },
            trend: mapTrend(trend.items.filter((row) => row.currency === currency)),
            channels: mapBreakdowns(
              channels.items.filter((row) => row.currency === currency),
              "channel",
            ),
            brands: mapBreakdowns(
              brands.items.filter((row) => row.currency === currency),
              "brand",
            ),
          } satisfies CurrencySalesGroup;
        }),
        stock: {
          totalOnHand: summary.stock.totalOnHandQuantity,
          variantCount: summary.stock.variantCount,
          locationCount: summary.stock.locationCount,
          asOf: summary.inventoryAsOf,
        },
        topProducts: products.items.map(mapProduct),
        noSalesWithCurrentStock: noSales.items.map(mapProduct),
      };
    },

    async getSales(query, view) {
      const response = await client.getSalesReport({
        ...reportPeriodQuery(query.range),
        view,
        ...(view === "trend" ? { bucket: "day" as const } : {}),
      });
      const currencies = [...new Set(response.items.map((row) => row.currency))].sort();
      return {
        meta: mapMeta(response.period),
        view: response.view,
        currencies: currencies.map((currency) => ({
          currency,
          trend:
            view === "trend"
              ? mapTrend(response.items.filter((row) => row.currency === currency))
              : [],
          rows:
            view === "trend"
              ? []
              : mapBreakdowns(
                  response.items.filter((row) => row.currency === currency),
                  view,
                ),
        })) satisfies SalesReportCurrencyGroup[],
      };
    },

    async getProductSales(query, ranking, view) {
      const response = await client.getProductsReport({
        ...reportPeriodQuery(query.range),
        level: ranking,
        view,
        limit: PAGE_SIZE,
        cursor: query.cursor,
      });
      return {
        meta: mapMeta(response.period),
        ranking: response.level,
        view: response.view,
        items: { items: response.items.map(mapProduct), nextCursor: response.pageInfo.nextCursor },
      };
    },

    async getInventory(query, view) {
      const response = await client.getInventoryReport({
        view,
        ...(view === "balances" ? {} : reportPeriodQuery(query.range)),
        limit: PAGE_SIZE,
        cursor: query.cursor,
      });
      return {
        meta: response.period ? mapMeta(response.period) : null,
        asOf: response.asOf,
        view: response.view,
        items: {
          items: response.items.map((item, index) => mapInventory(item, index)),
          nextCursor: response.pageInfo.nextCursor,
        },
      };
    },

    async getReturns(query, ranking) {
      const period = reportPeriodQuery(query.range);
      const [summary, rows] = await Promise.all([
        client.getReturnsReport({ ...period, view: "summary" }),
        client.getReturnsReport({
          ...period,
          view: ranking === "product" ? "products" : "variants",
          limit: PAGE_SIZE,
          cursor: query.cursor,
        }),
      ]);
      return {
        meta: mapMeta(summary.period),
        ranking,
        currencies: (summary.summary?.byCurrency ?? []).map((row) => ({
          currency: row.currency,
          metrics: {
            acceptedReturnedMinor: row.acceptedReturnedValueMinor,
            succeededRefundedMinor: row.succeededRefundMinor,
            pendingRefundMinor: row.pendingRefundMinor,
            returnCount: row.returnCount,
          },
        })),
        dispositions: (summary.summary?.byDisposition ?? []).map((row) => ({
          disposition: row.disposition,
          returnedUnits: row.returnedQuantity,
        })),
        products: {
          items: (rows.items ?? []).map(mapReturnedProduct),
          nextCursor: rows.pageInfo?.nextCursor ?? null,
        },
      };
    },

    async getPromotions(query) {
      const response = await client.getPromotionsReport(reportPeriodQuery(query.range));
      return {
        meta: mapMeta(response.period),
        promotions: response.items.map((row) => ({
          id: row.promotionId,
          promotionName: row.promotionName ?? row.codeSnapshot ?? `Promotion ${row.promotionId}`,
          currency: row.currency,
          redemptions: row.redemptionCount,
          discountMinor: row.discountAmountMinor,
          associatedOrders: row.orderCount,
          grossMinor: row.grossSalesMinor,
          netMinor: row.netSalesMinor,
          cancelledOrders: row.cancelledOrderCount,
        })),
      };
    },

    async getSuppliers(query) {
      const response = await client.getSuppliersReport({
        ...reportPeriodQuery(query.range),
        limit: PAGE_SIZE,
        cursor: query.cursor,
      });
      return {
        meta: mapMeta(response.period),
        suppliers: {
          items: response.items.map((row) => ({
            id: row.supplierId,
            supplierName:
              row.supplierName ?? row.supplierNameSnapshot ?? `Supplier ${row.supplierId}`,
            receiptCount: row.receiptCount,
            unitsReceived: row.unitsReceived,
            lastReceiptAt: row.lastReceiptAt,
          })),
          nextCursor: response.pageInfo.nextCursor,
        },
      };
    },
  };
  adapterCache.set(client, adapter);
  return adapter;
}

function mapMeta(period: ReportPeriod): ReportMeta {
  return {
    timezone: period.timezone,
    fromInclusive: period.fromInclusive,
    toExclusive: period.toExclusive,
  };
}

function mapTrend(items: SalesReportItem[]): TrendPoint[] {
  return items.flatMap((row) =>
    row.bucketStart
      ? [
          {
            label: row.bucketStart,
            fromInclusive: row.bucketStart,
            netMinor: row.netSalesMinor,
            orders: row.orderCount,
          },
        ]
      : [],
  );
}

function mapBreakdowns(items: SalesReportItem[], view: Exclude<SalesView, "trend">) {
  return items.map((row) => mapBreakdown(row, view));
}

function mapBreakdown(
  row: SalesReportItem,
  view: Exclude<SalesView, "trend">,
): NamedSalesBreakdown {
  let id: string;
  let label: string;
  switch (view) {
    case "channel":
      id = row.channel ?? "unattributed-channel";
      label = row.channel === "pos" ? "POS" : row.channel === "online" ? "Online" : "Unattributed";
      break;
    case "brand":
      id = row.brandId ?? "unattributed-brand";
      label = row.brandName ?? "Unattributed Brand";
      break;
    case "pos_branch":
      id = row.branchId ?? "unattributed-pos-branch";
      label = row.branchName ?? "Unattributed POS branch";
      break;
    case "pos_register":
      id = row.registerId ?? "unattributed-pos-register";
      label = row.registerName ?? "Unattributed POS register";
      break;
    case "pos_operator":
      id = row.membershipId ?? "unattributed-pos-operator";
      label = row.operatorName ?? "Unattributed POS operator";
      break;
  }
  return {
    id,
    label,
    grossMinor: row.grossSalesMinor,
    discountMinor: row.discountsMinor,
    netMinor: row.netSalesMinor,
    orders: row.orderCount,
  };
}

function mapProduct(row: ProductReportItem): ProductRankingRow {
  return {
    id: row.variantId ?? row.productId,
    productName: row.productName,
    variantId: row.variantId,
    sku: row.sku,
    currency: row.currency,
    unitsSold: row.unitsSold,
    grossMinor: row.grossSalesMinor,
    discountMinor: row.allocatedDiscountsMinor,
    netMinor: row.netSalesMinor,
    currentOnHand: row.onHandQuantity,
  };
}

function mapInventory(row: InventoryReportItem, index: number): InventoryReportRow {
  return {
    id: [row.operationId, row.variantId, row.inventoryLocationId, String(index)]
      .filter(Boolean)
      .join(":"),
    operationType: row.operationType,
    occurredAt: row.occurredAt,
    productName: row.productName,
    variantId: row.variantId,
    sku: row.sku,
    inventoryLocationName: row.locationName,
    onHand: row.onHandQuantity,
    quantityDelta: row.quantityDelta,
    actorMembershipId: row.actorMembershipId ?? undefined,
    notes: row.notes ?? undefined,
    supplierName: row.supplierName ?? undefined,
    lineCount: row.lineCount,
    unitsIn: row.unitsIn,
    unitsOut: row.unitsOut,
  };
}

function mapReturnedProduct(row: ReturnsReportItem) {
  return {
    id: row.variantId ?? row.productId,
    productName: row.productName,
    variantId: row.variantId,
    sku: row.sku,
    currency: row.currency,
    returnedUnits: row.returnedQuantity,
    acceptedReturnedMinor: row.returnedValueMinor,
  };
}
