import type { ClassifiedCommerceError } from "../commerce/errors";
import { t } from "../i18n";

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
      heading: t("errorHead.auth"),
      message: t("writeErr.authMessage"),
      recovery: "none",
    };
  }
  if (error.kind === "forbidden") {
    return {
      heading: t("errorHead.forbidden"),
      message: t("promoWriteErr.denied"),
      recovery: "none",
    };
  }

  switch (error.code) {
    case "PROMOTION_ECONOMICS_LOCKED":
      return {
        heading: t("promoWriteErr.economicsLocked"),
        message: t("promoWriteErr.economicsLockedMsg"),
        recovery: "replace",
      };
    case "PROMOTION_CODE_CONFLICT":
      return {
        heading: t("promoWriteErr.codeConflict"),
        message: t("promoWriteErr.codeConflictMsg"),
        recovery: "edit",
      };
    case "INVALID_PROMOTION":
    case "VALIDATION_ERROR":
      return {
        heading: t("promoWriteErr.invalid"),
        message: t("promoWriteErr.invalidMsg"),
        recovery: "edit",
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        heading: t("writeErr.duplicateOp"),
        message: t("promoWriteErr.duplicateMsg"),
        recovery: "none",
      };
    case "PROMOTION_NOT_FOUND":
      return {
        heading: t("promoWriteErr.notFound"),
        message: t("promoWriteErr.notFoundMsg"),
        recovery: "none",
      };
    default:
      break;
  }

  if (error.status === 409) {
    return {
      heading: t("promoWriteErr.changed"),
      message: t("promoWriteErr.changedMsg"),
      recovery: "edit",
    };
  }
  if (error.kind === "network") {
    return {
      heading: t("writeErr.networkProblem"),
      message: t("promoWriteErr.networkMsg"),
      recovery: "retry",
    };
  }
  return {
    heading: t("errorHead.unknown"),
    message: t("promoWriteErr.unknownMsg"),
    recovery: "retry",
  };
}
