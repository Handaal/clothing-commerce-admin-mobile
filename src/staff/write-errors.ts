/**
 * Local, semantic Staff write-error categories and their presentation.
 *
 * These map the REAL, frozen Staff API error codes (SDK 0.10.0 / `src/staff/errors.ts`) onto local
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
 * The REAL, frozen Staff API error codes (SDK 0.10.0 / API `src/staff/errors.ts`). This is the single
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
        heading: "Not allowed to delegate this",
        message:
          "You cannot grant a role or permission you do not hold yourself. The change was not applied.",
        recovery: "none",
      };
    case "last-admin":
      return {
        category,
        heading: "Last administrator",
        message:
          "This is the final staff administrator and cannot be removed or deactivated. Assign another administrator first.",
        recovery: "none",
      };
    case "staff-conflict":
      return {
        category,
        heading: "Change conflicts",
        message:
          "This staff change conflicts with the current state — for example the person is already a member, the assignment already exists, or the membership was already revoked. Refresh and review before trying again.",
        recovery: "none",
      };
    case "identity-inactive":
      return {
        category,
        heading: "Account not active",
        message:
          "The selected account is not active and cannot be linked as staff. Choose a different account.",
        recovery: "edit",
      };
    case "invalid":
      return {
        category,
        heading: "Invalid details",
        message: "Some of the details are not valid. Correct them and try again.",
        recovery: "edit",
      };
    case "session":
      return {
        category,
        heading: "Session problem",
        message: "Your session is invalid or has expired. Please sign in again.",
        recovery: "none",
      };
    case "denied":
      return {
        category,
        heading: "Access denied",
        message:
          "You are signed in, but the server denied this staff operation. It was not applied.",
        recovery: "none",
      };
    case "conflict":
      return {
        category,
        heading: "Duplicate operation",
        message:
          "This operation key was already used with different details. Start a new operation to continue.",
        recovery: "none",
      };
    case "not-found":
      return {
        category,
        heading: "Not found",
        message: "This staff member could not be found. Refresh and try again.",
        recovery: "none",
      };
    case "ambiguous":
      return {
        category,
        heading: "Network problem",
        message:
          "The Commerce API could not be reached. The operation may or may not have been applied — retry to complete it safely.",
        recovery: "retry",
      };
    case "unknown":
      return {
        category,
        heading: "Something went wrong",
        message: `${error.message} You can retry.`,
        recovery: "retry",
      };
  }
}
