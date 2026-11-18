import type { ClassifiedCommerceError } from "../commerce/errors";
import { t } from "../i18n";

/**
 * Recovery for a failed fulfil / cancel of an online order. The API stays authoritative and the operation
 * either applied or it did not — this only decides which affordance to show.
 *
 * - `retry`  — AMBIGUOUS outcome (transport/5xx). The retry MUST reuse the same idempotency key so the
 *   order is shipped or cancelled at most once.
 * - `reload` — the order moved underneath the screen (shipped, cancelled, quantities changed); reload it
 *   and start a fresh operation.
 * - `none`   — terminal for this attempt (auth/forbidden/stock/location/duplicate).
 */
export type OrderWriteRecovery = "retry" | "reload" | "none";

export interface DescribedOrderWriteError {
  heading: string;
  message: string;
  recovery: OrderWriteRecovery;
}

export function describeOrderWriteError(error: ClassifiedCommerceError): DescribedOrderWriteError {
  if (error.kind === "auth") {
    return { heading: t("errorHead.auth"), message: t("writeErr.authMessage"), recovery: "none" };
  }
  if (error.kind === "forbidden") {
    return {
      heading: t("errorHead.forbidden"),
      message: t("orderWriteErr.forbidden"),
      recovery: "none",
    };
  }
  switch (error.code) {
    case "ORDER_ALREADY_FULFILLED":
      return {
        heading: t("orderWriteErr.changed"),
        message: t("orderWriteErr.shipped"),
        recovery: "reload",
      };
    case "ORDER_CANCELLED":
      return {
        heading: t("orderWriteErr.changed"),
        message: t("orderWriteErr.cancelled"),
        recovery: "reload",
      };
    case "OVER_FULFILLMENT":
    case "ORDER_LINE_NOT_FOUND":
    case "ORDER_LINE_MISMATCH":
      return {
        heading: t("orderWriteErr.changed"),
        message: t("orderWriteErr.overFulfilment"),
        recovery: "reload",
      };
    case "INSUFFICIENT_STOCK":
      return {
        heading: t("orderWriteErr.noStockTitle"),
        message: t("orderWriteErr.noStock"),
        recovery: "none",
      };
    case "FULFILLMENT_LOCATION_UNRESOLVED":
    case "LOCATION_INACTIVE":
    case "LOCATION_CAPABILITY_DENIED":
      return {
        heading: t("orderWriteErr.locationTitle"),
        message: t("orderWriteErr.location"),
        recovery: "none",
      };
    case "ORDER_CHANNEL_UNSUPPORTED":
      return {
        heading: t("orderWriteErr.notAllowed"),
        message: t("orderWriteErr.channel"),
        recovery: "none",
      };
    case "ORDER_NOT_FOUND":
      return {
        heading: t("errorHead.notFound"),
        message: t("orderWriteErr.notFound"),
        recovery: "none",
      };
    case "IDEMPOTENCY_CONFLICT":
      return {
        heading: t("writeErr.duplicateOp"),
        message: t("writeErr.duplicateOpMessage"),
        recovery: "reload",
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
