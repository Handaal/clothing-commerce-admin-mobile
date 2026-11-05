import type { ClassifiedCommerceError } from "../commerce/errors";
import { t } from "../i18n";

/**
 * How the UI should let the operator recover from a failed return create / refund settlement. Derived
 * from the classified error plus the API's stable error `code`; the API stays authoritative and the
 * operation either applied or it did not — this only decides which recovery affordance to show.
 *
 * - `retry` — AMBIGUOUS outcome (transport/5xx). The request may or may not have been applied, so the
 *   retry MUST reuse the same idempotency key (at-most-once). This is the only path that reuses the key.
 * - `reload` — the server's view moved underneath the draft (eligibility or settlement state changed).
 *   The operator must reload the authoritative state and start a fresh operation (new key).
 * - `edit` — a correctable rejection (bad quantity/reason/location). The operation did NOT apply; the
 *   operator edits the inputs and submits a new operation.
 * - `none` — terminal for this attempt (auth/forbidden/not-found/policy/idempotency conflict). No retry
 *   affordance; the operator dismisses.
 */
export type ReturnWriteRecovery = "retry" | "reload" | "edit" | "none";

export interface DescribedReturnWriteError {
  heading: string;
  message: string;
  recovery: ReturnWriteRecovery;
}

/** Map a failed create-return / settle-refund attempt to a localized, recovery-tagged description. */
export function describeReturnWriteError(
  error: ClassifiedCommerceError,
): DescribedReturnWriteError {
  if (error.kind === "auth") {
    return {
      heading: t("errorHead.auth"),
      message: t("writeErr.authMessage"),
      recovery: "none",
    };
  }
  if (error.kind === "forbidden") {
    return {
      heading: t("errorHead.forbidden"),
      message: t("returnWriteErr.authDenied"),
      recovery: "none",
    };
  }

  switch (error.code) {
    // The order's returnable quantity changed (another return consumed it) — reload eligibility.
    case "RETURN_QUANTITY_EXCEEDED":
    case "ORDER_LINE_MISMATCH":
      return {
        heading: t("returnWriteErr.quantityChanged"),
        message: t("returnWriteErr.quantityChangedMsg"),
        recovery: "reload",
      };
    // The refund's settlement state moved underneath us (already settled / amount changed).
    case "REFUND_CONFLICT":
      return {
        heading: t("returnWriteErr.refundConflict"),
        message: t("returnWriteErr.refundConflictMsg"),
        recovery: "reload",
      };
    case "RESTOCK_LOCATION_UNAVAILABLE":
      return {
        heading: t("returnWriteErr.restockLocation"),
        message: t("returnWriteErr.restockLocationMsg"),
        recovery: "edit",
      };
    case "RETURN_REASON_NOT_ALLOWED":
      return {
        heading: t("returnWriteErr.reasonNotAllowed"),
        message: t("returnWriteErr.reasonNotAllowedMsg"),
        recovery: "edit",
      };
    case "INVALID_RETURN":
      return {
        heading: t("errorHead.validation"),
        message: t("returnWriteErr.invalidMsg"),
        recovery: "edit",
      };
    // Policy / order-state rejections that the operator cannot fix by editing the draft.
    case "RETURNS_DISABLED":
    case "ORDER_NOT_RETURNABLE":
    case "PAYMENT_NOT_CAPTURED":
    case "RETURN_WINDOW_EXPIRED":
    case "MANUAL_REFUND_NOT_ALLOWED":
      return {
        heading: t("returnWriteErr.notAllowed"),
        message: t("returnWriteErr.notAllowedMsg"),
        recovery: "none",
      };
    case "RETURN_NOT_FOUND":
      return {
        heading: t("errorHead.notFound"),
        message: t("returnWriteErr.notFoundMsg"),
        recovery: "none",
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        heading: t("writeErr.duplicateOp"),
        message: t("writeErr.duplicateOpMessage"),
        recovery: "none",
      };
    default:
      break;
  }

  if (error.kind === "network") {
    return {
      heading: t("writeErr.networkProblem"),
      message: t("writeErr.networkMessage"),
      recovery: "retry",
    };
  }
  return {
    heading: t("errorHead.unknown"),
    message: t("writeErr.retrySuffix", { message: error.message }),
    recovery: "retry",
  };
}
