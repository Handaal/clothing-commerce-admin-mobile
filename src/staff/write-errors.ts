/**
 * Local, semantic Staff write-error categories and their presentation.
 *
 * The final Staff SDK error codes are NOT frozen (contract still under review), so this app must not
 * invent exact API codes. Instead it defines its OWN semantic categories for the security-sensitive
 * failures the server is expected to enforce, and maps a {@link ClassifiedCommerceError} onto them. The
 * server remains authoritative; these are UI surfaces prepared in advance so that, at integration time,
 * the ONLY change is wiring the final SDK's real error codes into {@link PROVISIONAL_STAFF_ERROR_CODES}.
 *
 * The provisional codes below are placeholders kept in one place — they are the app's guesses at the
 * eventual stable codes and MUST be reconciled with the real SDK errors during integration. Anti-
 * escalation and last-admin protections are distinct, non-actionable surfaces: the UI must never assume
 * a visible role/scope is actually assignable, and never present a server refusal as a silent success.
 */

import type { ClassifiedCommerceError } from "../commerce/errors";

/**
 * Distinct staff-write outcomes the UI prepares a recovery for. Each is kept separate — nothing collapses
 * into one generic error:
 *
 * - `cannot-delegate` — you may not grant a role/permission you do not yourself hold (subset-of-own rule).
 * - `last-admin` — you may not remove/deactivate the final staff administrator.
 * - `foreign-scope` — you may not assign a scope outside your own authority.
 * - `protected-assignment` — a protected assignment cannot be mutated.
 * - `membership-exists` — this identity is already a member of the tenant.
 * - `identity-not-found` — the chosen identity could not be linked (it may have changed).
 * - `invalid` — locally-correctable invalid input.
 * - `session` / `denied` — auth (401) / generic authorization (403) not covered by a specific category.
 * - `conflict` — an idempotency-key conflict (same key, different payload) — start a fresh operation.
 * - `not-found` — the membership/target no longer exists.
 * - `ambiguous` — transport/5xx; may or may not have applied, so a retry must reuse the same key.
 * - `unknown` — anything else.
 */
export type StaffErrorCategory =
  | "cannot-delegate"
  | "last-admin"
  | "foreign-scope"
  | "protected-assignment"
  | "membership-exists"
  | "identity-not-found"
  | "invalid"
  | "session"
  | "denied"
  | "conflict"
  | "not-found"
  | "ambiguous"
  | "unknown";

/**
 * PROVISIONAL server codes — the app's placeholders for the eventual stable Staff error codes. These
 * are the SINGLE place to reconcile with the final SDK contract at integration time. They are NOT a
 * claimed contract today.
 */
export const PROVISIONAL_STAFF_ERROR_CODES = {
  cannotDelegate: "CANNOT_DELEGATE_UNHELD_PERMISSION",
  lastAdmin: "LAST_STAFF_ADMIN",
  foreignScope: "FOREIGN_SCOPE",
  protectedAssignment: "PROTECTED_ASSIGNMENT",
  membershipExists: "MEMBERSHIP_ALREADY_EXISTS",
  identityNotFound: "IDENTITY_NOT_FOUND",
  invalid: ["INVALID_STAFF", "VALIDATION_ERROR"],
  conflict: "IDEMPOTENCY_CONFLICT",
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
 * won't change it), so it is matched BEFORE the transport/kind fallback — a `409` carrying a business
 * code (e.g. membership-exists) is that business case, not an ambiguous transport failure. Only a
 * failure with no known code falls through to the kind-based buckets (ambiguous / denied / not-found).
 */
export function categorizeStaffWriteError(error: ClassifiedCommerceError): StaffErrorCategory {
  if (error.kind === "auth") return "session";

  const code = error.code;
  const codes = PROVISIONAL_STAFF_ERROR_CODES;
  if (code === codes.cannotDelegate) return "cannot-delegate";
  if (code === codes.lastAdmin) return "last-admin";
  if (code === codes.foreignScope) return "foreign-scope";
  if (code === codes.protectedAssignment) return "protected-assignment";
  if (code === codes.membershipExists) return "membership-exists";
  if (code === codes.identityNotFound) return "identity-not-found";
  if (code && codes.invalid.includes(code as (typeof codes.invalid)[number])) return "invalid";
  if (code === codes.conflict) return "conflict";

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
    case "foreign-scope":
      return {
        category,
        heading: "Scope outside your authority",
        message:
          "You cannot assign an access scope outside your own authority. The change was not applied.",
        recovery: "none",
      };
    case "protected-assignment":
      return {
        category,
        heading: "Protected assignment",
        message: "This assignment is protected and cannot be changed. The change was not applied.",
        recovery: "none",
      };
    case "membership-exists":
      return {
        category,
        heading: "Already a member",
        message:
          "This person is already a member of this business. Open their existing staff record instead.",
        recovery: "none",
      };
    case "identity-not-found":
      return {
        category,
        heading: "Person not found",
        message:
          "The selected person could not be linked — they may no longer be available. Search and choose again.",
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
