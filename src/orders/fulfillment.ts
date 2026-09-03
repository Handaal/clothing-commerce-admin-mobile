import type { OrderDetailResponse } from "@shifted/clothing-commerce-sdk";

export type FulfillmentStatus = OrderDetailResponse["fulfillmentProgress"]["status"];
export type FulfillmentLine = OrderDetailResponse["fulfillmentProgress"]["lines"][number];

/**
 * Human label for the server's overall fulfillment status. Display-only: the enum value comes from
 * `fulfillmentProgress.status` and is authoritative — this function never derives or overrides it.
 */
export function fulfillmentStatusLabel(status: FulfillmentStatus): string {
  switch (status) {
    case "unfulfilled":
      return "Unfulfilled";
    case "partially_fulfilled":
      return "Partially fulfilled";
    case "fulfilled":
      return "Fulfilled";
  }
}

/**
 * Presentational per-line quantity summary, e.g. `(1, 2) → "1 / 2 fulfilled"`. Reads the explicit
 * `fulfilledQuantity` / `orderedQuantity` fields verbatim — it is NOT used as business or
 * authorization state, only as a read-only label.
 */
export function fulfillmentQuantityLabel(fulfilled: number, ordered: number): string {
  return `${fulfilled} / ${ordered} fulfilled`;
}

/**
 * Indexes fulfillment lines by their `lineNumber` so an order line can be paired with its
 * fulfillment progress for display. Purely a lookup; no quantities are combined or inferred.
 */
export function fulfillmentByLineNumber(
  progress: OrderDetailResponse["fulfillmentProgress"],
): Map<number, FulfillmentLine> {
  return new Map(progress.lines.map((line) => [line.lineNumber, line]));
}
