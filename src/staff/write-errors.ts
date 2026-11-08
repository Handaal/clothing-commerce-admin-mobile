/**
 * Local, semantic Staff write-error categories and their presentation.
 *
 * These map the REAL, frozen Staff API error codes (SDK 0.11.0 / `src/staff/errors.ts`) onto local
 * semantic categories with a distinct heading, message and recovery each — nothing collapses into one
 * generic error, and `IDEMPOTENCY_CONFLICT` is never hidden. The server remains authoritative: the UI
 * never assumes a visible role/scope is actually assignable, and never presents a server refusal as a
 * silent success.
 *
 * The API deliberately uses a small, shared code set: `STAFF_PRIVILEGE_ESCALATION` covers BOTH
 * "grant a permission you do not hold" and "assign a scope outside your authority" (anti-escalation);
 * `STAFF_CONFLICT` covers a membership/assignment already existing, a revoked membership, and a refused
 * lifecycle transition. We map each real code to its clearest UI surface rather than inventing finer
 * codes the server does not emit.
 */

import type { ClassifiedCommerceError } from "../commerce/errors";
import { t } from "../i18n";

/**
 * Distinct staff-write outcomes the UI prepares a recovery for. Each is kept separate — nothing collapses
 * into one generic error:
 *
 * - `cannot-delegate` — anti-escalation (`STAFF_PRIVILEGE_ESCALATION`): you may not grant a role or scope
 *   carrying authority you do not yourself hold tenant-wide (this one code covers foreign-scope too).
 * - `last-admin` — you may not remove/suspend/deactivate the final staff administrator (`LAST_STAFF_ADMIN`).
 * - `staff-conflict` — the membership/assignment is in a conflicting state (`STAFF_CONFLICT`): already a
 *   member, a duplicate active assignment, a revoked membership, or a refused lifecycle transition.
 * - `identity-inactive` — the chosen identity is not active and cannot be linked (`IDENTITY_INACTIVE`).
 * - `invalid` — locally-correctable invalid input (`INVALID_STAFF`).
 * - `session` / `denied` — auth (401) / generic authorization (403) not covered by a specific category.
 * - `conflict` — an idempotency-key conflict (same key, different payload) — start a fresh operation.
 * - `not-found` — the membership/target no longer exists (`STAFF_NOT_FOUND`).
 * - `ambiguous` — transport/5xx; may or may not have applied, so a retry must reuse the same key.
 * - `unknown` — anything else.
 */
export type StaffErrorCategory =
  | "cannot-delegate"
  | "last-admin"
  | "staff-conflict"
  | "identity-inactive"
  | "invalid"
  | "session"
  | "denied"
  | "conflict"
  | "not-found"
  | "ambiguous"
  | "unknown";

/**
 * The REAL, frozen Staff API error codes (SDK 0.11.0 / API `src/staff/errors.ts`). This is the single
 * place the app names them — every screen classifies through {@link categorizeStaffWriteError}.
 */
export const STAFF_ERROR_CODES = {
  privilegeEscalation: "STAFF_PRIVILEGE_ESCALATION",
  lastAdmin: "LAST_STAFF_ADMIN",
  staffConflict: "STAFF_CONFLICT",
  identityInactive: "IDENTITY_INACTIVE",
  invalid: "INVALID_STAFF",
  idempotencyConflict: "IDEMPOTENCY_CONFLICT",
  notFound: "STAFF_NOT_FOUND",
} as const;

/** How the UI should let the operator recover from a given failure. */
export type StaffWriteRecovery = "retry" | "edit" | "none";

export interface DescribedStaffWriteError {
  category: StaffErrorCategory;
  heading: string;
  message: string;
  recovery: StaffWriteRecovery;
}

/**
 * Classify a failure into a local semantic category. A KNOWN business code is deterministic (retrying
 * won't change it), so it is matched BEFORE the transport/kind fallback — a `409`/`403` carrying a
 * business code is that business case, not an ambiguous transport failure. Only a failure with no known
 * code falls through to the kind-based buckets (ambiguous / denied / not-found).
 */
export function categorizeStaffWriteError(error: ClassifiedCommerceError): StaffErrorCategory {
  if (error.kind === "auth") return "session";

  const code = error.code;
  const codes = STAFF_ERROR_CODES;
  if (code === codes.privilegeEscalation) return "cannot-delegate";
  if (code === codes.lastAdmin) return "last-admin";
  if (code === codes.staffConflict) return "staff-conflict";
  if (code === codes.identityInactive) return "identity-inactive";
  if (code === codes.invalid) return "invalid";
  if (code === codes.idempotencyConflict) return "conflict";
  if (code === codes.notFound) return "not-found";

  if (error.kind === "network" || error.kind === "server" || error.kind === "contract") {
    return "ambiguous";
  }
  if (error.kind === "forbidden") return "denied";
  if (error.kind === "not-found") return "not-found";
  return "unknown";
}

export function describeStaffWriteError(error: ClassifiedCommerceError): DescribedStaffWriteError {
  const category = categorizeStaffWriteError(error);
  switch (category) {
    case "cannot-delegate":
      return {
        category,
        heading: t("staffWriteErr.cannotDelegate"),
        message: t("staffWriteErr.cannotDelegateMsg"),
        recovery: "none",
      };
    case "last-admin":
      return {
        category,
        heading: t("staffWriteErr.lastAdmin"),
        message: t("staffWriteErr.lastAdminMsg"),
        recovery: "none",
      };
    case "staff-conflict":
      return {
        category,
        heading: t("staffWriteErr.conflict"),
        message: t("staffWriteErr.conflictMsg"),
        recovery: "none",
      };
    case "identity-inactive":
      return {
        category,
        heading: t("staffWriteErr.inactive"),
        message: t("staffWriteErr.inactiveMsg"),
        recovery: "edit",
      };
    case "invalid":
      return {
        category,
        heading: t("staffWriteErr.invalid"),
        message: t("staffWriteErr.invalidMsg"),
        recovery: "edit",
      };
    case "session":
      return {
        category,
        heading: t("errorHead.auth"),
        message: t("writeErr.authMessage"),
        recovery: "none",
      };
    case "denied":
      return {
        category,
        heading: t("errorHead.forbidden"),
        message: t("staffWriteErr.denied"),
        recovery: "none",
      };
    case "conflict":
      return {
        category,
        heading: t("writeErr.duplicateOp"),
        message: t("writeErr.duplicateOpMessage"),
        recovery: "none",
      };
    case "not-found":
      return {
        category,
        heading: t("errorHead.notFound"),
        message: t("staffWriteErr.notFoundMsg"),
        recovery: "none",
      };
    case "ambiguous":
      return {
        category,
        heading: t("writeErr.networkProblem"),
        message: t("writeErr.networkMessage"),
        recovery: "retry",
      };
    case "unknown":
      return {
        category,
        heading: t("errorHead.unknown"),
        message: t("writeErr.retrySuffix", { message: error.message }),
        recovery: "retry",
      };
  }
}
