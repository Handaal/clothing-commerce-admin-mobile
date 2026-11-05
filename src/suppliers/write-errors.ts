/**
 * Maps a classified Supplier write failure to a distinct, actionable message. Mirrors the inventory
 * `describeInventoryWriteError` discipline: authorization is decided by the classifier's `kind`, and
 * the API's stable business `code` (surfaced on `ApiHttpError.code`) selects the specific message.
 * Each failure category is kept distinct — nothing is collapsed into one generic error — and an
 * `IDEMPOTENCY_CONFLICT` is never hidden: it means the same key was reused with a different payload,
 * so the operator must start a fresh operation rather than silently retry.
 */

import type { ClassifiedCommerceError } from "../commerce/errors";
import { t } from "../i18n";

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
      heading: t("errorHead.auth"),
      message: t("writeErr.authMessage"),
      recovery: "none",
    };
  }
  if (error.kind === "forbidden") {
    return {
      heading: t("errorHead.forbidden"),
      message: t("supWriteErr.authDenied"),
      recovery: "none",
    };
  }

  switch (error.code) {
    case "SUPPLIER_CODE_CONFLICT":
      return {
        heading: t("supWriteErr.codeConflict"),
        message: t("supWriteErr.codeConflictMsg"),
        recovery: "edit",
      };
    case "SUPPLIER_INACTIVE":
      return {
        heading: t("supWriteErr.inactive"),
        message: t("supWriteErr.inactiveMsg"),
        recovery: "none",
      };
    case "SUPPLIER_NOT_FOUND":
      return {
        heading: t("supWriteErr.notFound"),
        message: t("supWriteErr.notFoundMsg"),
        recovery: "none",
      };
    case "INVALID_SUPPLIER":
    case "INVALID_SUPPLIER_PURCHASE":
    case "VALIDATION_ERROR":
      return {
        heading: t("supWriteErr.invalid"),
        message: t("supWriteErr.invalidMsg"),
        recovery: "edit",
      };
    case "INVENTORY_LOCATION_UNAVAILABLE":
      return {
        heading: t("supWriteErr.locationUnavailable"),
        message: t("supWriteErr.locationUnavailableMsg"),
        recovery: "edit",
      };
    case "PAYMENT_EXCEEDS_DUES":
      return {
        heading: t("supWriteErr.paymentExceeds"),
        message: t("supWriteErr.paymentExceedsMsg"),
        recovery: "edit",
      };
    case "NO_OUTSTANDING_DUES":
      return {
        heading: t("supWriteErr.noDues"),
        message: t("supWriteErr.noDuesMsg"),
        recovery: "none",
      };
    case "SUPPLIER_PURCHASE_NOT_FOUND":
    case "SUPPLIER_REMINDER_NOT_FOUND":
      return {
        heading: t("supWriteErr.notFound"),
        message: t("supWriteErr.notFoundMsg2"),
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

  if (error.kind === "not-found") {
    return {
      heading: t("supWriteErr.notFound"),
      message: t("supWriteErr.notFoundMsg2"),
      recovery: "none",
    };
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
