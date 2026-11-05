import type { ClassifiedCommerceError } from "../commerce/errors";
import { t } from "../i18n";

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
      heading: t("errorHead.auth"),
      message: t("writeErr.authMessage"),
      recovery: "none",
      isConcurrencyConflict: false,
    };
  }
  if (error.kind === "forbidden") {
    return {
      heading: t("errorHead.forbidden"),
      message: t("invWriteErr.authDenied"),
      recovery: "none",
      isConcurrencyConflict: false,
    };
  }

  // Stable business codes carried on the API error envelope (surfaced by the SDK as ApiHttpError.code).
  switch (error.code) {
    case "CONCURRENT_MODIFICATION":
      return {
        heading: t("invWriteErr.stockChanged"),
        message: t("invWriteErr.stockChangedMsg"),
        recovery: "reconcile",
        isConcurrencyConflict: true,
      };
    case "INSUFFICIENT_STOCK":
      return {
        heading: t("invWriteErr.insufficient"),
        message: t("invWriteErr.insufficientMsg"),
        recovery: "edit",
        isConcurrencyConflict: false,
      };
    case "INVALID_QUANTITY":
      return {
        heading: t("invWriteErr.invalidQty"),
        message: t("invWriteErr.invalidQtyMsg"),
        recovery: "edit",
        isConcurrencyConflict: false,
      };
    case "SAME_TRANSFER_LOCATION":
      return {
        heading: t("invWriteErr.sameLocation"),
        message: t("invWriteErr.sameLocationMsg"),
        recovery: "edit",
        isConcurrencyConflict: false,
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        heading: t("writeErr.duplicateOp"),
        message: t("writeErr.duplicateOpMessage"),
        recovery: "none",
        isConcurrencyConflict: false,
      };
    case "LOCATION_CAPABILITY_DENIED":
      return {
        heading: t("invWriteErr.notPermitted"),
        message: t("invWriteErr.notPermittedMsg"),
        recovery: "none",
        isConcurrencyConflict: false,
      };
    case "LOCATION_INACTIVE":
    case "VARIANT_INACTIVE":
      return {
        heading: t("invWriteErr.notActive"),
        message: t("invWriteErr.notActiveMsg"),
        recovery: "none",
        isConcurrencyConflict: false,
      };
    case "VARIANT_NOT_FOUND":
    case "LOCATION_NOT_FOUND":
      return {
        heading: t("errorHead.notFound"),
        message: t("invWriteErr.notFoundMsg"),
        recovery: "none",
        isConcurrencyConflict: false,
      };
    default:
      break;
  }

  // Transport / unexpected server failures: the outcome is AMBIGUOUS, so recovery reuses the key.
  if (error.kind === "network") {
    return {
      heading: t("writeErr.networkProblem"),
      message: t("writeErr.networkMessage"),
      recovery: "retry",
      isConcurrencyConflict: false,
    };
  }
  return {
    heading: t("errorHead.unknown"),
    message: t("writeErr.retrySuffix", { message: error.message }),
    recovery: "retry",
    isConcurrencyConflict: false,
  };
}
