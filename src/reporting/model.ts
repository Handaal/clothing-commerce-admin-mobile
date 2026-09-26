/** Admin-owned reporting view models. SDK wire types stay in adapter.ts. */

export type DatePreset = "today" | "7-days" | "30-days" | "custom";

export interface ReportDateRange {
  preset: DatePreset;
  /** Tenant-local calendar dates (YYYY-MM-DD). Only present for the custom preset. */
  from?: string;
  to?: string;
}

export interface ReportQuery {
  range: ReportDateRange;
  /** Undefined means show every returned currency as a separate group. */
  currency?: string;
}

export interface PagedReportQuery extends ReportQuery {
  cursor?: string;
}

export type ReportExportRequest =
  | {
      dataset: "sales-products";
      range: ReportDateRange;
      level: "product" | "variant";
    }
  | {
      dataset: "inventory-movements" | "returns" | "supplier-receipts";
      range: ReportDateRange;
    };

/** The SDK-owned CSV document. Every field is passed to the platform save/share boundary unchanged. */
export interface ReportExportDocument {
  body: string;
  mediaType: string;
  filename: string;
}

export interface ReportMeta {
  timezone: string;
  fromInclusive: string;
  toExclusive: string;
}

export interface ReportPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SalesMetrics {
  grossMinor: number;
  discountMinor: number;
  netMinor: number;
  orders: number;
  averageOrderValueMinor: number | null;
}

export interface ReturnsMetrics {
  acceptedReturnedMinor: number;
  succeededRefundedMinor: number;
  pendingRefundMinor: number;
  returnCount: number;
}

export interface TrendPoint {
  label: string;
  /** Canonical bucket start returned by the service. */
  fromInclusive: string;
  netMinor: number;
  orders: number;
}

export interface NamedSalesBreakdown {
  id: string;
  label: string;
  grossMinor: number;
  discountMinor: number;
  netMinor: number;
  orders: number;
}

export interface CurrencySalesGroup {
  currency: string;
  sales: SalesMetrics;
  returns: ReturnsMetrics;
  trend: TrendPoint[];
  channels: NamedSalesBreakdown[];
  brands: NamedSalesBreakdown[];
}

export interface ProductRankingRow {
  id: string;
  productName: string;
  variantId?: string;
  sku?: string;
  currency?: string;
  unitsSold?: number;
  grossMinor?: number;
  discountMinor?: number;
  netMinor?: number;
  currentOnHand?: number;
}

export interface StockSummary {
  totalOnHand: number;
  variantCount: number;
  locationCount: number;
  asOf: string;
}

export interface DashboardReport {
  meta: ReportMeta;
  currencies: CurrencySalesGroup[];
  stock: StockSummary;
  topProducts: ProductRankingRow[];
  noSalesWithCurrentStock: ProductRankingRow[];
}

export type SalesReportView =
  "trend" | "channel" | "brand" | "pos_branch" | "pos_register" | "pos_operator";

export interface SalesReportCurrencyGroup {
  currency: string;
  trend: TrendPoint[];
  rows: NamedSalesBreakdown[];
}

export interface SalesReport {
  meta: ReportMeta;
  view: SalesReportView;
  currencies: SalesReportCurrencyGroup[];
}

export type ProductReportView = "sales" | "no_sales_with_current_stock";

export interface ProductSalesReport {
  meta: ReportMeta;
  ranking: "product" | "variant";
  view: ProductReportView;
  items: ReportPage<ProductRankingRow>;
}

export type InventoryReportView =
  "balances" | "movements" | "receipts" | "transfers" | "adjustments";

export interface InventoryReportRow {
  id: string;
  operationType?: string;
  occurredAt?: string;
  productName?: string;
  variantId?: string;
  sku?: string;
  inventoryLocationName?: string;
  onHand?: number;
  quantityDelta?: number;
  actorMembershipId?: string;
  notes?: string;
  supplierName?: string;
  lineCount?: number;
  unitsIn?: number;
  unitsOut?: number;
}

export interface InventoryReport {
  meta: ReportMeta | null;
  asOf: string | null;
  view: InventoryReportView;
  items: ReportPage<InventoryReportRow>;
}

export interface ReturnedProductRow {
  id: string;
  productName: string;
  variantId?: string;
  sku?: string;
  currency: string;
  returnedUnits: number;
  acceptedReturnedMinor: number;
}

export interface CurrencyReturnsGroup {
  currency: string;
  metrics: ReturnsMetrics;
}

export interface ReturnDispositionRow {
  disposition: string;
  returnedUnits: number;
}

export interface ReturnsReport {
  meta: ReportMeta;
  ranking: "product" | "variant";
  currencies: CurrencyReturnsGroup[];
  dispositions: ReturnDispositionRow[];
  products: ReportPage<ReturnedProductRow>;
}

export interface PromotionReportRow {
  id: string;
  promotionName: string;
  currency: string;
  redemptions: number;
  discountMinor: number;
  associatedOrders: number;
  grossMinor: number;
  netMinor: number;
  cancelledOrders: number;
}

export interface PromotionsReport {
  meta: ReportMeta;
  promotions: PromotionReportRow[];
}

export interface SupplierReportRow {
  id: string;
  supplierName: string;
  receiptCount: number;
  unitsReceived: number;
  lastReceiptAt: string | null;
}

export interface SuppliersReport {
  meta: ReportMeta;
  suppliers: ReportPage<SupplierReportRow>;
}
