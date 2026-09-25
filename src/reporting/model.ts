/** Admin-owned reporting view models. These are presentation shapes, not API/SDK wire DTOs. */

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
  averageOrderValueMinor: number;
}

export interface ReturnsMetrics {
  acceptedReturnedMinor: number;
  succeededRefundedMinor: number;
  pendingRefundMinor: number;
  returnCount: number;
}

export interface TrendPoint {
  label: string;
  fromInclusive: string;
  toExclusive: string;
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
  posBranches: NamedSalesBreakdown[];
  posRegisters: NamedSalesBreakdown[];
  posOperators: NamedSalesBreakdown[];
}

export interface ProductRankingRow {
  id: string;
  productName: string;
  variantName?: string;
  sku?: string;
  currency: string;
  unitsSold: number;
  grossMinor: number;
  discountMinor: number;
  netMinor: number;
  noSalesWithCurrentStock?: boolean;
}

export interface InventoryException {
  id: string;
  productName: string;
  variantName: string;
  inventoryLocationName: string;
  onHand: number;
  label: string;
}

export interface DashboardReport {
  meta: ReportMeta;
  currencies: CurrencySalesGroup[];
  topProducts: ProductRankingRow[];
  inventoryExceptions: InventoryException[];
}

export interface SalesReport {
  meta: ReportMeta;
  currencies: CurrencySalesGroup[];
}

export interface ProductSalesReport {
  meta: ReportMeta;
  ranking: "product" | "variant";
  items: ReportPage<ProductRankingRow>;
}

export interface InventoryBalanceRow {
  id: string;
  productName: string;
  variantName: string;
  sku?: string;
  inventoryLocationName: string;
  onHand: number;
}

export type InventoryMovementKind = "receipt" | "transfer" | "adjustment";

export interface InventoryMovementRow {
  id: string;
  occurredAt: string;
  kind: InventoryMovementKind;
  productName: string;
  variantName: string;
  quantity: number;
  inventoryLocationName: string;
  relatedInventoryLocationName?: string;
}

export interface InventoryReport {
  meta: ReportMeta;
  balances: InventoryBalanceRow[];
  movements: ReportPage<InventoryMovementRow>;
}

export interface ReturnedProductRow extends ProductRankingRow {
  returnedUnits: number;
  disposition: string;
}

export interface CurrencyReturnsGroup {
  currency: string;
  metrics: ReturnsMetrics;
}

export interface ReturnsReport {
  meta: ReportMeta;
  currencies: CurrencyReturnsGroup[];
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
}

export interface PromotionsReport {
  meta: ReportMeta;
  promotions: ReportPage<PromotionReportRow>;
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
