import type { OrderReturnSummary } from "@shifted/clothing-commerce-sdk";

/**
 * Indexes the order-embedded returns summary by the order's own `lineNumber`, so an order line can be
 * paired with its cumulative returned quantity for display. Purely a lookup — no quantities are
 * combined, and an absent summary (caller lacks return scope, or none returned) yields an empty map.
 */
export function returnedQuantityByLine(
  summary: OrderReturnSummary | undefined,
): Map<number, number> {
  const map = new Map<number, number>();
  if (!summary) return map;
  for (const line of summary.lines) {
    map.set(line.lineNumber, line.returnedQuantity);
  }
  return map;
}

/**
 * Whether the summary carries any real return activity (returned units or refund money). Used to
 * decide whether the order shows return totals — an all-zero summary is treated as "nothing returned"
 * rather than fabricated activity.
 */
export function hasReturnActivity(summary: OrderReturnSummary | undefined): boolean {
  if (!summary) return false;
  return (
    summary.pendingRefundMinor > 0 ||
    summary.refundedMinor > 0 ||
    summary.lines.some((line) => line.returnedQuantity > 0)
  );
}
