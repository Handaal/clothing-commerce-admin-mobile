import type { ClassifiedCommerceError } from "../commerce/errors";

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

const NOT_PUBLISHABLE_EXPLANATION =
  "This product does not yet meet the Storefront publish prerequisites. A publishable product needs " +
  "to be active, have at least one active variant, and have a valid current price. Fix what is missing, " +
  "then publish again.";

export function describeCatalogWriteError(
  error: ClassifiedCommerceError,
): DescribedCatalogWriteError {
  // Authentication / authorization are decided by the classifier's kind, independent of any code.
  if (error.kind === "auth") {
    return {
      heading: "Session problem",
      message: "Your session is invalid or has expired. Please sign in again.",
      recovery: "none",
      isNotPublishable: false,
    };
  }
  if (error.kind === "forbidden") {
    return {
      heading: "Not authorized",
      message:
        "You are signed in, but the server did not authorize this catalog change. It was not applied.",
      recovery: "none",
      isNotPublishable: false,
    };
  }

  // Stable business codes carried on the API error envelope (surfaced by the SDK as ApiHttpError.code).
  switch (error.code) {
    case "SLUG_CONFLICT":
      return {
        heading: "Slug already in use",
        message:
          "Another product in this brand already uses that storefront slug. Choose a different slug and try again.",
        recovery: "edit",
        isNotPublishable: false,
      };
    case "STYLE_CODE_CONFLICT":
      return {
        heading: "Style code already in use",
        message:
          "Another product already uses that style code. Enter a unique style code and try again.",
        recovery: "edit",
        isNotPublishable: false,
      };
    case "SKU_CONFLICT":
      return {
        heading: "SKU already in use",
        message: "Another variant already uses that SKU. Enter a unique SKU and try again.",
        recovery: "edit",
        isNotPublishable: false,
      };
    case "PRODUCT_NOT_PUBLISHABLE":
      return {
        heading: "Not ready to publish",
        message: NOT_PUBLISHABLE_EXPLANATION,
        recovery: "edit",
        isNotPublishable: true,
      };
    case "PRODUCT_PUBLISHED":
      return {
        heading: "Product is published",
        message:
          "This change is not allowed while the product is published to the Storefront. Unpublish it first, then try again.",
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "INVALID_LIFECYCLE_TRANSITION":
      return {
        heading: "Status change not allowed",
        message:
          "That status change is not valid from the product's current state. Refresh and choose a valid action.",
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "PRODUCT_NOT_FOUND":
      return {
        heading: "Product not found",
        message:
          "This product could not be found. It may have been removed. Go back to the product list and refresh.",
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "VARIANT_NOT_FOUND":
      return {
        heading: "Variant not found",
        message: "This variant could not be found. Refresh the product and try again.",
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "MEDIA_NOT_FOUND":
      return {
        heading: "Media not found",
        message: "This image could not be found. Refresh the product and try again.",
        recovery: "refresh",
        isNotPublishable: false,
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        heading: "Duplicate operation",
        message:
          "This operation key was already used with different details. Start a new operation to continue.",
        recovery: "none",
        isNotPublishable: false,
      };
    case "VALIDATION":
    case "INVALID_REQUEST":
      return {
        heading: "Check the details",
        message: `${error.message} Fix the highlighted fields and try again.`,
        recovery: "edit",
        isNotPublishable: false,
      };
    default:
      break;
  }

  // A 400 without a recognised code is still a client-side validation problem: editable, not retryable.
  if (error.status === 400) {
    return {
      heading: "Check the details",
      message: `${error.message} Fix the details and try again.`,
      recovery: "edit",
      isNotPublishable: false,
    };
  }

  // Transport / unexpected server failures: the outcome is AMBIGUOUS, so recovery reuses the key.
  if (error.kind === "network") {
    return {
      heading: "Network problem",
      message:
        "The Commerce API could not be reached. The change may or may not have been applied — retry to complete it safely.",
      recovery: "retry",
      isNotPublishable: false,
    };
  }
  return {
    heading: "Something went wrong",
    message: `${error.message} You can retry.`,
    recovery: "retry",
    isNotPublishable: false,
  };
}
