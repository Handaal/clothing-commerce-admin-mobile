/**
 * Server-derived Supplier capability guidance from `GET /me/context`.
 *
 * `access.suppliers` is OPTIONAL on the context: an older server, or a caller with no supplier access
 * at all, omits it entirely. This helper reads it defensively into a stable `{ canRead, canManage }`
 * shape, defaulting to `false` when absent. It drives UI AFFORDANCES only (showing/hiding the
 * navigation entry, create, edit and status controls) — the Commerce API remains the sole authority
 * and still authorizes every read and write, so a hidden control is never the security boundary.
 */

import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

export interface SupplierCapabilities {
  canRead: boolean;
  canManage: boolean;
}

export function supplierCapabilities(context: MeContextResponse): SupplierCapabilities {
  const suppliers = context.access.suppliers;
  return {
    canRead: suppliers?.canRead ?? false,
    canManage: suppliers?.canManage ?? false,
  };
}
