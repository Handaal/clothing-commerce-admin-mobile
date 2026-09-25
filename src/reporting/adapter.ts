import type { TenantCommerceClient } from "@shifted/clothing-commerce-sdk";

import type {
  DashboardReport,
  InventoryReport,
  PagedReportQuery,
  ProductSalesReport,
  PromotionsReport,
  ReportQuery,
  ReturnsReport,
  SalesReport,
  SuppliersReport,
} from "./model";

/**
 * The only reporting transport boundary screens consume. Implement SDK DTO -> Admin view-model
 * adaptation here once the canonical artifact exists; components must remain wire-shape agnostic.
 *
 * Transport binding pending SDK 0.13.0.
 */
export interface ReportingAdapter {
  getDashboard(query: ReportQuery): Promise<DashboardReport>;
  getSales(query: ReportQuery): Promise<SalesReport>;
  getProductSales(
    query: PagedReportQuery,
    ranking: "product" | "variant",
  ): Promise<ProductSalesReport>;
  getInventory(query: PagedReportQuery): Promise<InventoryReport>;
  getReturns(query: PagedReportQuery): Promise<ReturnsReport>;
  getPromotions(query: PagedReportQuery): Promise<PromotionsReport>;
  getSuppliers(query: PagedReportQuery): Promise<SuppliersReport>;
}

/** No guessed calls: production remains deliberately unbound until SDK 0.13.0 is vendored. */
export function resolveReportingAdapter(client: TenantCommerceClient): ReportingAdapter | null {
  void client;
  return null;
}
