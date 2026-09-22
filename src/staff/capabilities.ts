/**
 * Server-derived Staff capability guidance — the ONE seam that reads the staff context block.
 *
 * `GET /me/context` now exposes a typed `access.staff` block (SDK 0.10.0: `{ canRead, canManage }`,
 * optional). This helper is the single place that reads it, mapping it into a stable
 * {@link StaffCapabilities} shape and defaulting to `false` when absent (older server / no staff access).
 *
 * It drives UI AFFORDANCES only (navigation entry, Add-Staff, and mutation controls). The Commerce API
 * remains the sole authority and still authorizes every read and write — a hidden control is never the
 * security boundary. Deny-by-default: an unreadable/absent capability means "no access", never "allow".
 */

import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

export interface StaffCapabilities {
  /** May list/read staff (list + detail). */
  canRead: boolean;
  /** May mutate staff (Add-Staff, role/scope assignment, lifecycle). Implies read at the UI layer. */
  canManage: boolean;
}

export function staffCapabilities(context: MeContextResponse): StaffCapabilities {
  const staff = context.access.staff;
  const canManage = staff?.canManage ?? false;
  // Manage implies read at the UI layer; the server still authorizes each read independently.
  const canRead = (staff?.canRead ?? false) || canManage;
  return { canRead, canManage };
}
