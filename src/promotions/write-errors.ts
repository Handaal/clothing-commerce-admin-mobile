import type { ClassifiedCommerceError } from "../commerce/errors";

export type PromotionWriteRecovery = "retry" | "edit" | "none" | "replace";

export interface DescribedPromotionWriteError {
  heading: string;
  message: string;
  recovery: PromotionWriteRecovery;
}

export function describePromotionWriteError(
  error: ClassifiedCommerceError,
): DescribedPromotionWriteError {
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
      message: "The server denied this Promotion operation. Nothing was applied.",
      recovery: "none",
    };
  }

  switch (error.code) {
    case "PROMOTION_ECONOMICS_LOCKED":
      return {
        heading: "Promotion already used",
        message:
          "Its discount economics are locked after the first redemption. Deactivate this Promotion and create a new one for changed economics.",
        recovery: "replace",
      };
    case "PROMOTION_CODE_CONFLICT":
      return {
        heading: "Code already in use",
        message: "Choose a different Promotion code and try again.",
        recovery: "edit",
      };
    case "INVALID_PROMOTION":
    case "VALIDATION_ERROR":
      return {
        heading: "Check Promotion details",
        message: "Some Promotion details are invalid. Correct them and try again.",
        recovery: "edit",
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        heading: "Duplicate operation",
        message: "This operation key was already used with different details. Start again.",
        recovery: "none",
      };
    case "PROMOTION_NOT_FOUND":
      return {
        heading: "Promotion not found",
        message: "This Promotion or code no longer exists. Go back and refresh.",
        recovery: "none",
      };
    default:
      break;
  }

  if (error.status === 409) {
    return {
      heading: "Promotion changed",
      message: "The Promotion changed while you were working. Refresh it before trying again.",
      recovery: "edit",
    };
  }
  if (error.kind === "network") {
    return {
      heading: "Network problem",
      message:
        "The Commerce API could not be reached. The operation may have been applied; retry safely with the same request.",
      recovery: "retry",
    };
  }
  return {
    heading: "Something went wrong",
    message: "The Promotion operation did not complete. Try again.",
    recovery: "retry",
  };
}
