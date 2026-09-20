/**
 * The narrow Supplier integration seam.
 *
 * Phase 2N ships the Admin-Mobile UX/domain foundation ONLY. The Supplier API and its SDK surface do
 * not exist yet (Codex delivers "Supplier Core" later). Every Supplier screen depends on this
 * interface, never on a concrete client — so when the SDK arrives, lighting up the whole foundation is
 * a single, narrow change: implement {@link resolveSupplierAdapter} to return an object that maps the
 * SDK DTOs onto the local model here.
 *
 * Until then {@link resolveSupplierAdapter} returns `null`, and screens render an explicit
 * "not yet available" integration state instead of fabricating suppliers, mutations or history. The
 * app NEVER hand-writes a fetch client, invents endpoints, or manufactures a successful Supplier write.
 */

import type { TenantCommerceClient } from "@shifted/clothing-commerce-sdk";

import type { CursorPage } from "../commerce/pagination";
import type {
  Supplier,
  SupplierDraft,
  SupplierReceipt,
  SupplierStatus,
  SupplierSummary,
} from "./model";
import type { SupplierListQuery } from "./search";

/** List responses reuse the shared cursor-page envelope so the bounded paginator applies unchanged. */
export type SupplierListPage = CursorPage<SupplierSummary>;
export type SupplierReceiptPage = CursorPage<SupplierReceipt>;

/**
 * The complete set of Supplier operations the foundation is built against. Write operations take an
 * app-supplied idempotency key, mirroring the inventory/catalog write discipline — the same key is
 * reused on an ambiguous retry so a create/update is applied at most once. The eventual SDK owns the
 * transport and the `Idempotency-Key` header; this app never sets headers itself.
 */
export interface SupplierAdapter {
  listSuppliers(query: SupplierListQuery): Promise<SupplierListPage>;
  getSupplier(supplierId: string): Promise<Supplier>;
  createSupplier(draft: SupplierDraft, idempotencyKey: string): Promise<Supplier>;
  updateSupplier(
    supplierId: string,
    draft: SupplierDraft,
    idempotencyKey: string,
  ): Promise<Supplier>;
  setSupplierStatus(
    supplierId: string,
    status: SupplierStatus,
    idempotencyKey: string,
  ): Promise<Supplier>;
  listSupplierReceipts(
    supplierId: string,
    query: { cursor?: string },
  ): Promise<SupplierReceiptPage>;
}

/**
 * Resolve the Supplier adapter for a tenant-scoped client. Returns `null` for now because the Supplier
 * API/SDK does not exist. When SDK 0.9.x (or whatever final version) adds the supplier surface, replace
 * the body with a concrete implementation that calls the SDK and maps its DTOs to the local model — the
 * ONLY change needed to activate the list, detail, create/edit, status and receiving-history screens.
 */
export function resolveSupplierAdapter(client: TenantCommerceClient): SupplierAdapter | null {
  // `client` will back the concrete adapter once the Supplier SDK surface exists; it is intentionally
  // unused until then. Referenced here so the seam keeps its final signature without a lint suppression.
  void client;
  return null;
}
