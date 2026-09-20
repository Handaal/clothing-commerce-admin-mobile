import type { Refund, ReturnDetailResponse } from "@shifted/clothing-commerce-sdk";

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
      return "Refund pending";
    case "succeeded":
      return "Refund succeeded";
    case "failed":
      return "Refund failed";
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
      return "Settlement is still owed. The refund has not been recorded as paid.";
    case "succeeded":
      return "Settlement has been recorded.";
    case "failed":
      return "The refund attempt failed. The amount remains reserved against the payment.";
  }
}

/** Payment method label, matching the wording used on the order payment surface. */
export function refundMethodLabel(method: RefundMethod): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "cash_on_delivery":
      return "Cash on delivery";
    case "electronic":
      return "Electronic";
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
      return "Restocked";
    case "non_restock":
      return "Not restocked (damaged / write-off)";
  }
}

/** Compact disposition summary for a whole return, for the return-history list rows. */
export function dispositionSummary(
  lines: ReadonlyArray<{ disposition: ReturnDisposition }>,
): string {
  const hasRestock = lines.some((line) => line.disposition === "restock");
  const hasNonRestock = lines.some((line) => line.disposition === "non_restock");
  if (hasRestock && hasNonRestock) return "Restocked · write-off";
  if (hasRestock) return "Restocked";
  if (hasNonRestock) return "Write-off";
  return "—";
}

/** Human label for the audit-only client source. It is never used as an authorization credential. */
export function returnSourceLabel(source: ReturnSource): string {
  switch (source) {
    case "admin-mobile":
      return "Admin mobile";
    case "pos":
      return "POS";
    case "management":
      return "Management";
  }
}

/** Uppercase channel badge label, matching the ONLINE / POS badges used across the orders surface. */
export function returnChannelLabel(channel: ReturnChannel): string {
  return channel.toUpperCase();
}
