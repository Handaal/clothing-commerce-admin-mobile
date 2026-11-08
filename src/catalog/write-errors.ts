import type { ClassifiedCommerceError } from "../commerce/errors";
import { t } from "../i18n";

/**
 * How the UI should let the manager recover from a failed catalog write. Derived from the classified
 * error and the API's stable error `code`. The API stays authoritative — the operation either applied
 * or it did not — this only decides which recovery affordance to show.
 *
 * - `retry` — AMBIGUOUS outcome (transport/5xx). The request may or may not have been applied, so the
 *   retry MUST reuse the same idempotency key (at-most-once). This is the only path that reuses the key.
 * - `edit` — a correctable input rejection (conflict / validation / not-yet-publishable). The write did
 *   NOT apply; the manager edits the inputs and submits a new operation (new key).
 * - `refresh` — server-side state drifted from what the screen showed (not-found, invalid lifecycle
 *   transition, already-published/unpublished). Re-read the product before trying again.
 * - `none` — terminal for this attempt (auth/forbidden/idempotency conflict). No retry affordance; the
 *   manager dismisses/resets.
 */
export type CatalogWriteRecovery = "retry" | "edit" | "refresh" | "none";

export interface DescribedCatalogWriteError {
  heading: string;
  message: string;
  recovery: CatalogWriteRecovery;
  /** True only for `PRODUCT_NOT_PUBLISHABLE`, so the publish UX can show the prerequisite explanation. */
  isNotPublishable: boolean;
}

export function describeCatalogWriteError(
  error: ClassifiedCommerceError,
): DescribedCatalogWriteError {
  // Authentication / authorization are decided by the classifier's kind, independent of any code.
  if (error.kind === "auth") {
    return {
      heading: t("errorHead.auth"),
      message: t("writeErr.authMessage"),
      recovery: "none",
      isNotPublishable: false,
    };
  }
  if (error.kind === "forbidden") {
    return {
      heading: t("catWriteErr.notAuthorized"),
      message: t("catWriteErr.notAuthorizedMsg"),
      recovery: "none",
      isNotPublishable: false,
    };
  }

  // Stable business codes carried on the API error envelope (surfaced by the SDK as ApiHttpError.code).
  switch (error.code) {
    case "SLUG_CONFLICT":
      return {
        heading: t("catWriteErr.slugConflict"),
        message: t("catWriteErr.slugConflictMsg"),
        recovery: "edit",
        isNotPublishable: false,
      };
    case "STYLE_CODE_CONFLICT":
      return {
        heading: t("catWriteErr.styleConflict"),
        message: t("catWriteErr.styleConflictMsg"),
        recovery: "edit",
        isNotPublishable: false,
      };
    case "SKU_CONFLICT":
      return {
        heading: t("catWriteErr.skuConflict"),
        message: t("catWriteErr.skuConflictMsg"),
        recovery: "edit",
        isNotPublishable: false,
      };
    case "PRODUCT_NOT_PUBLISHABLE":
      return {
        heading: t("catWriteErr.notReady"),
        message: t("catWriteErr.notPublishable"),
        recovery: "edit",
        isNotPublishable: true,
      };
    case "PRODUCT_PUBLISHED":
      return {
        heading: t("catWriteErr.published"),
        message: t("catWriteErr.publishedMsg"),
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "INVALID_LIFECYCLE_TRANSITION":
      return {
        heading: t("catWriteErr.lifecycle"),
        message: t("catWriteErr.lifecycleMsg"),
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "PRODUCT_NOT_FOUND":
      return {
        heading: t("catWriteErr.productNotFound"),
        message: t("catWriteErr.productNotFoundMsg"),
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "VARIANT_NOT_FOUND":
      return {
        heading: t("catWriteErr.variantNotFound"),
        message: t("catWriteErr.variantNotFoundMsg"),
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "MEDIA_NOT_FOUND":
      return {
        heading: t("catWriteErr.mediaNotFound"),
        message: t("catWriteErr.mediaNotFoundMsg"),
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        heading: t("writeErr.duplicateOp"),
        message: t("writeErr.duplicateOpMessage"),
        recovery: "none",
        isNotPublishable: false,
      };
    case "VALIDATION":
    case "INVALID_REQUEST":
      return {
        heading: t("catWriteErr.checkDetails"),
        message: t("catWriteErr.checkFieldsMsg", { message: error.message }),
        recovery: "edit",
        isNotPublishable: false,
      };
    default:
      break;
  }

  // A 400 without a recognised code is still a client-side validation problem: editable, not retryable.
  if (error.status === 400) {
    return {
      heading: t("catWriteErr.checkDetails"),
      message: t("catWriteErr.checkDetailsMsg", { message: error.message }),
      recovery: "edit",
      isNotPublishable: false,
    };
  }

  // Transport / unexpected server failures: the outcome is AMBIGUOUS, so recovery reuses the key.
  if (error.kind === "network") {
    return {
      heading: t("writeErr.networkProblem"),
      message: t("writeErr.networkMessage"),
      recovery: "retry",
      isNotPublishable: false,
    };
  }
  return {
    heading: t("errorHead.unknown"),
    message: t("writeErr.retrySuffix", { message: error.message }),
    recovery: "retry",
    isNotPublishable: false,
  };
}
