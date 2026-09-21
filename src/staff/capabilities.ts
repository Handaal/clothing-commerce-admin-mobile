/**
 * Server-derived Staff capability guidance — the ONE seam that reads the (not-yet-frozen) staff context.
 *
 * The final `GET /me/context` staff contract is not yet frozen, so this app must not scatter guesses at
 * SDK context fields throughout the UI. Instead, ALL staff capability mapping is isolated here. The
 * currently vendored SDK's `MeContextResponse` does not yet type an `access.staff` block, so this reads
 * it STRUCTURALLY and defensively into a stable `{ canRead, canManage }` shape, defaulting to `false`
 * when absent (older server / no staff access). When the final context DTO lands, this helper is the
 * single, narrow place to retype against the real field.
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

/**
 * The staff capability block as the final context is EXPECTED to expose it. This is the app's local
 * expectation only — it is NOT claimed to be the SDK contract. Kept optional/partial so a structural
 * read never throws regardless of what the server actually sends.
 */
interface ExpectedStaffAccess {
  canRead?: boolean;
  canManage?: boolean;
}

/** Structurally read `access.staff` without depending on a not-yet-frozen SDK type. */
function readStaffAccess(context: MeContextResponse): ExpectedStaffAccess | undefined {
  const access = context.access as { staff?: ExpectedStaffAccess | null };
  return access.staff ?? undefined;
}

export function staffCapabilities(context: MeContextResponse): StaffCapabilities {
  const staff = readStaffAccess(context);
  const canManage = staff?.canManage ?? false;
  // Manage implies read at the UI layer; the server still authorizes each read independently.
  const canRead = (staff?.canRead ?? false) || canManage;
  return { canRead, canManage };
}
