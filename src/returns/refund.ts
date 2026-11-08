import type { Refund, ReturnDetailResponse } from "@shifted/clothing-commerce-sdk";

import { t } from "../i18n";

export type RefundStatus = Refund["status"]; // "pending" | "succeeded" | "failed"
export type RefundMethod = Refund["method"]; // "cash" | "cash_on_delivery" | "electronic"
export type ReturnDisposition = ReturnDetailResponse["lines"][number]["disposition"]; // restock | non_restock
export type ReturnChannel = ReturnDetailResponse["channel"]; // "pos" | "online"
export type ReturnSource = ReturnDetailResponse["source"]; // "admin-mobile" | "pos" | "management"

/**
 * Human label for the server's exact refund state. The value is authoritative and rendered verbatim —
 * `pending` is NEVER presented as a completed/settled refund (see {@link refundStatusDetail}).
 */
export function refundStatusLabel(status: RefundStatus): string {
  switch (status) {
    case "pending":
      return t("refund.pending");
    case "succeeded":
      return t("refund.succeeded");
    case "failed":
      return t("refund.failed");
  }
}

/**
 * A clarifying sentence for each refund state, taken from the API's documented semantics: `pending`
 * still owes settlement, `succeeded` has recorded it, and `failed` still reserves the amount. This
 * keeps a pending refund from reading as money already returned.
 */
export function refundStatusDetail(status: RefundStatus): string {
  switch (status) {
    case "pending":
      return t("refund.pendingDetail");
    case "succeeded":
      return t("refund.succeededDetail");
    case "failed":
      return t("refund.failedDetail");
  }
}

/** Payment method label, matching the wording used on the order payment surface. */
export function refundMethodLabel(method: RefundMethod): string {
  switch (method) {
    case "cash":
      return t("payMethod.cash");
    case "cash_on_delivery":
      return t("payMethod.cod");
    case "electronic":
      return t("payMethod.electronic");
  }
}

/**
 * Operational effect of a line's inventory disposition. `restock` returns sellable stock; the
 * non-restock branch covers damaged / written-off merchandise that does not re-enter sellable
 * inventory. No internal warehouse/subledger detail is exposed.
 */
export function dispositionLabel(disposition: ReturnDisposition): string {
  switch (disposition) {
    case "restock":
      return t("disposition.restocked");
    case "non_restock":
      return t("disposition.nonRestock");
  }
}

/** Compact disposition summary for a whole return, for the return-history list rows. */
export function dispositionSummary(
  lines: ReadonlyArray<{ disposition: ReturnDisposition }>,
): string {
  const hasRestock = lines.some((line) => line.disposition === "restock");
  const hasNonRestock = lines.some((line) => line.disposition === "non_restock");
  if (hasRestock && hasNonRestock) return t("disposition.restockWriteoff");
  if (hasRestock) return t("disposition.restocked");
  if (hasNonRestock) return t("disposition.writeoff");
  return t("disposition.none");
}

/** Human label for the audit-only client source. It is never used as an authorization credential. */
export function returnSourceLabel(source: ReturnSource): string {
  switch (source) {
    case "admin-mobile":
      return t("returnSource.adminMobile");
    case "pos":
      return t("returnSource.pos");
    case "management":
      return t("returnSource.management");
  }
}

/** Uppercase channel badge label, matching the ONLINE / POS badges used across the orders surface. */
export function returnChannelLabel(channel: ReturnChannel): string {
  return channel.toUpperCase();
}
