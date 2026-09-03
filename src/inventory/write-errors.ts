import type { ClassifiedCommerceError } from "../commerce/errors";

/**
 * How the UI should let the operator recover from a failed inventory write. This is derived from the
 * classified error and the API's stable error `code`; the API remains authoritative and the operation
 * either applied or it did not — this only decides which recovery affordance to show.
 *
 * - `retry` — AMBIGUOUS outcome (transport/5xx). The request may or may not have been applied, so the
 *   retry MUST reuse the same idempotency key (at-most-once). This is the only path that reuses the key.
 * - `reconcile` — the counted version was stale (`CONCURRENT_MODIFICATION`). Never blindly retried:
 *   the stock changed, so the list is refreshed and the operator must recount against the new state
 *   (a brand-new operation with a new key).
 * - `edit` — a correctable business/validation rejection (e.g. insufficient stock). The operation did
 *   NOT apply; the operator edits the inputs and submits a new operation.
 * - `none` — terminal for this attempt (auth/forbidden/not-found/config/idempotency conflict). No
 *   retry affordance; the operator dismisses/resets.
 */
export type InventoryWriteRecovery = "retry" | "reconcile" | "edit" | "none";

export interface DescribedInventoryWriteError {
  heading: string;
  message: string;
  recovery: InventoryWriteRecovery;
  /** True only for a stale-version conflict, which drives the refresh-and-recount flow. */
  isConcurrencyConflict: boolean;
}

export function describeInventoryWriteError(
  error: ClassifiedCommerceError,
): DescribedInventoryWriteError {
  // Authentication / authorization are decided by the classifier's kind, independent of any code.
  if (error.kind === "auth") {
    return {
      heading: "Session problem",
      message: "Your session is invalid or has expired. Please sign in again.",
      recovery: "none",
      isConcurrencyConflict: false,
    };
  }
  if (error.kind === "forbidden") {
    return {
      heading: "Access denied",
      message:
        "You are signed in, but the server denied this inventory operation. It was not applied.",
      recovery: "none",
      isConcurrencyConflict: false,
    };
  }

  // Stable business codes carried on the API error envelope (surfaced by the SDK as ApiHttpError.code).
  switch (error.code) {
    case "CONCURRENT_MODIFICATION":
      return {
        heading: "Stock changed since your count",
        message:
          "The on-hand balance changed after you took this count, so it was not applied. Refresh and recount before reconciling.",
        recovery: "reconcile",
        isConcurrencyConflict: true,
      };
    case "INSUFFICIENT_STOCK":
      return {
        heading: "Not enough stock",
        message:
          "There is not enough stock on hand for this operation. Adjust the quantity and try again.",
        recovery: "edit",
        isConcurrencyConflict: false,
      };
    case "INVALID_QUANTITY":
      return {
        heading: "Invalid quantity",
        message: "The requested quantity is not valid. Edit it and try again.",
        recovery: "edit",
        isConcurrencyConflict: false,
      };
    case "SAME_TRANSFER_LOCATION":
      return {
        heading: "Same location",
        message: "A transfer's source and destination must be different locations.",
        recovery: "edit",
        isConcurrencyConflict: false,
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        heading: "Duplicate operation",
        message:
          "This operation key was already used with different details. Start a new operation to continue.",
        recovery: "none",
        isConcurrencyConflict: false,
      };
    case "LOCATION_CAPABILITY_DENIED":
      return {
        heading: "Operation not permitted here",
        message: "This inventory location does not permit this operation.",
        recovery: "none",
        isConcurrencyConflict: false,
      };
    case "LOCATION_INACTIVE":
    case "VARIANT_INACTIVE":
      return {
        heading: "Not available for this operation",
        message: "The selected item or location is not active for this operation.",
        recovery: "none",
        isConcurrencyConflict: false,
      };
    case "VARIANT_NOT_FOUND":
    case "LOCATION_NOT_FOUND":
      return {
        heading: "Not found",
        message: "The selected item or location could not be found. Refresh and try again.",
        recovery: "none",
        isConcurrencyConflict: false,
      };
    default:
      break;
  }

  // Transport / unexpected server failures: the outcome is AMBIGUOUS, so recovery reuses the key.
  if (error.kind === "network") {
    return {
      heading: "Network problem",
      message:
        "The Commerce API could not be reached. The operation may or may not have been applied — retry to complete it safely.",
      recovery: "retry",
      isConcurrencyConflict: false,
    };
  }
  return {
    heading: "Something went wrong",
    message: `${error.message} You can retry.`,
    recovery: "retry",
    isConcurrencyConflict: false,
  };
}
