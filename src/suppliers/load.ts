/**
 * Bounded, cursor-following loaders for the Supplier surfaces, reusing the shared pagination primitive
 * so they inherit its fail-closed cap (never present a truncated list as complete). Search/status
 * constraints ride in the server query — there is no client-side filtering of a fabricated dataset.
 */

import { collectAllPages, DEFAULT_MAX_PAGES } from "../commerce/pagination";
import type { SupplierAdapter } from "./adapter";
import type { SupplierPayment, SupplierPurchase } from "./ledger";
import type { SupplierReceipt, SupplierSummary } from "./model";
import type { SupplierListQuery } from "./search";

export const MAX_SUPPLIER_PAGES = DEFAULT_MAX_PAGES;
export const MAX_SUPPLIER_RECEIPT_PAGES = DEFAULT_MAX_PAGES;
export const MAX_SUPPLIER_LEDGER_PAGES = DEFAULT_MAX_PAGES;

/** Load the full supplier list for a query by following the server cursor across every page. */
export function loadAllSuppliers(
  adapter: SupplierAdapter,
  query: SupplierListQuery,
): Promise<SupplierSummary[]> {
  return collectAllPages(
    (cursor) => adapter.listSuppliers({ ...query, ...(cursor ? { cursor } : {}) }),
    MAX_SUPPLIER_PAGES,
  );
}

/** Load the full supplier-linked receiving history for one supplier, in server order. */
export function loadAllSupplierReceipts(
  adapter: SupplierAdapter,
  supplierId: string,
): Promise<SupplierReceipt[]> {
  return collectAllPages(
    (cursor) => adapter.listSupplierReceipts(supplierId, cursor ? { cursor } : {}),
    MAX_SUPPLIER_RECEIPT_PAGES,
  );
}

/** Load the full recorded-purchase ledger for one supplier, newest-first in server order. */
export function loadAllSupplierPurchases(
  adapter: SupplierAdapter,
  supplierId: string,
): Promise<SupplierPurchase[]> {
  return collectAllPages(
    (cursor) => adapter.listSupplierPurchases({ supplierId, ...(cursor ? { cursor } : {}) }),
    MAX_SUPPLIER_LEDGER_PAGES,
  );
}

/** Load the full payment history for one supplier, newest-first in server order. */
export function loadAllSupplierPayments(
  adapter: SupplierAdapter,
  supplierId: string,
): Promise<SupplierPayment[]> {
  return collectAllPages(
    (cursor) => adapter.listSupplierPayments(supplierId, cursor ? { cursor } : {}),
    MAX_SUPPLIER_LEDGER_PAGES,
  );
}
