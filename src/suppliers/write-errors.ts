/**
 * Maps a classified Supplier write failure to a distinct, actionable message. Mirrors the inventory
 * `describeInventoryWriteError` discipline: authorization is decided by the classifier's `kind`, and
 * the API's stable business `code` (surfaced on `ApiHttpError.code`) selects the specific message.
 * Each failure category is kept distinct — nothing is collapsed into one generic error — and an
 * `IDEMPOTENCY_CONFLICT` is never hidden: it means the same key was reused with a different payload,
 * so the operator must start a fresh operation rather than silently retry.
 */

import type { ClassifiedCommerceError } from "../commerce/errors";

/**
 * - `retry` — AMBIGUOUS outcome (transport / 5xx). The write may or may not have applied, so the retry
 *   MUST reuse the same idempotency key (at-most-once). The only path that reuses the key.
 * - `edit` — a correctable rejection (duplicate code, invalid data). The write did NOT apply; the
 *   operator edits the inputs and submits a new operation.
 * - `none` — terminal for this attempt (auth / forbidden / not-found / inactive / idempotency conflict).
 */
export type SupplierWriteRecovery = "retry" | "edit" | "none";

export interface DescribedSupplierWriteError {
  heading: string;
  message: string;
  recovery: SupplierWriteRecovery;
}

export function describeSupplierWriteError(
  error: ClassifiedCommerceError,
): DescribedSupplierWriteError {
  if (error.kind === "auth") {
    return {
      heading: "Session problem",
      message: "Your session is invalid or has expired. Please sign in again.",
      recovery: "none",
    };
  }
  if (error.kind === "forbidden") {
    return {
      heading: "Access denied",
      message:
        "You are signed in, but the server denied this supplier operation. It was not applied.",
      recovery: "none",
    };
  }

  switch (error.code) {
    case "SUPPLIER_CODE_CONFLICT":
      return {
        heading: "Reference code already in use",
        message:
          "Another supplier already uses this reference code. Choose a different code and try again.",
        recovery: "edit",
      };
    case "SUPPLIER_INACTIVE":
      return {
        heading: "Supplier is inactive",
        message: "This supplier is inactive and cannot be used for new receipts.",
        recovery: "none",
      };
    case "SUPPLIER_NOT_FOUND":
      return {
        heading: "Supplier not found",
        message:
          "This supplier could not be found. It may have been removed. Refresh and try again.",
        recovery: "none",
      };
    case "INVALID_SUPPLIER":
    case "VALIDATION_ERROR":
      return {
        heading: "Invalid supplier details",
        message: "Some of the supplier details are not valid. Correct them and try again.",
        recovery: "edit",
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        heading: "Duplicate operation",
        message:
          "This operation key was already used with different details. Start a new operation to continue.",
        recovery: "none",
      };
    default:
      break;
  }

  if (error.kind === "not-found") {
    return {
      heading: "Supplier not found",
      message: "This supplier could not be found. Refresh and try again.",
      recovery: "none",
    };
  }
  if (error.kind === "network") {
    return {
      heading: "Network problem",
      message:
        "The Commerce API could not be reached. The operation may or may not have been applied — retry to complete it safely.",
      recovery: "retry",
    };
  }
  return {
    heading: "Something went wrong",
    message: `${error.message} You can retry.`,
    recovery: "retry",
  };
}
