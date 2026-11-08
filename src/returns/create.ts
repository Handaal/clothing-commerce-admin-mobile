import type {
  ReturnDetailResponse,
  ReturnEligibilityResponse,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";

import { t } from "../i18n";

/**
 * Pure logic for creating a return against an order and settling its refund — the management-side
 * counterpart of the POS return desk, minus the Electron durable-workflow bridge (the mobile client is
 * a direct online caller). Producers take the tenant-scoped SDK client, the business args, and the
 * idempotency key, and return the SDK response verbatim: they add no headers, issue no direct `fetch`,
 * and invent no contract fields. The validators are local UX convenience only — the API re-checks every
 * rule and remains authoritative. Kept React-free so they can be unit-tested and wrapped by `useMutation`.
 */

export type ReturnDisposition = "restock" | "non_restock";

export type CreateReturnClient = Pick<TenantCommerceClient, "createReturn">;
export type SettleRefundClient = Pick<TenantCommerceClient, "settleRefund">;

/** The server's own description of one returnable order line. */
export type EligibilityLine = ReturnEligibilityResponse["lines"][number];

/** Caller-owned draft for one selected order line. Quantity is a raw input string until validated. */
export interface ReturnLineDraft {
  quantity: string;
  reason: string;
  disposition: ReturnDisposition;
}

/** The selected lines, keyed by `orderLineId`. Absence of a key means the line is not being returned. */
export type ReturnLineSelection = Record<string, ReturnLineDraft>;

/** A single line in the shape the API accepts. */
export interface BuiltReturnLine {
  orderLineId: string;
  quantity: number;
  reason: string;
  disposition: ReturnDisposition;
}

/** Maximum lines the API accepts in one return (mirrors the POS guard). */
export const MAX_RETURN_LINES = 100;
/** Maximum reason length the API accepts per line. */
export const MAX_REASON_LENGTH = 500;

/**
 * Project the current selection onto the API line array, in the server's eligibility order, dropping
 * any line the operator has not selected. Numbers are parsed here so validation and submission share
 * exactly one interpretation of the raw input.
 */
export function buildReturnLines(
  eligibility: ReturnEligibilityResponse,
  selection: ReturnLineSelection,
): BuiltReturnLine[] {
  return eligibility.lines.flatMap((line) => {
    const draft = selection[line.orderLineId];
    if (!draft) return [];
    return [
      {
        orderLineId: line.orderLineId,
        quantity: Number(draft.quantity),
        reason: draft.reason.trim(),
        disposition: draft.disposition,
      },
    ];
  });
}

/** True when any selected line restocks — a receiving location is then required for the receipt. */
export function requiresRestockLocation(lines: readonly BuiltReturnLine[]): boolean {
  return lines.some((line) => line.disposition === "restock");
}

/**
 * Validate the whole draft before enabling submission. Returns `null` when submittable; otherwise a
 * human message. Mirrors the POS desk's guards exactly: the order must be eligible, there must be
 * 1..{@link MAX_RETURN_LINES} selected lines, each line's quantity a positive integer within its
 * eligible remaining quantity, each reason present and within {@link MAX_REASON_LENGTH} and — when the
 * policy restricts reasons — drawn from the allowed set, and a receiving location chosen whenever any
 * line restocks.
 */
export function validateReturnDraft(args: {
  eligibility: ReturnEligibilityResponse;
  lines: readonly BuiltReturnLine[];
  restockLocationId: string | null;
}): string | null {
  const { eligibility, lines, restockLocationId } = args;

  if (!eligibility.eligible) return t("createReturn.errNotEligible");
  if (lines.length === 0) return t("createReturn.errNoLines");
  if (lines.length > MAX_RETURN_LINES) return t("createReturn.errTooManyLines");

  for (const line of lines) {
    const eligibleLine = eligibility.lines.find((item) => item.orderLineId === line.orderLineId);
    const eligibleQuantity = eligibleLine?.eligibleQuantity ?? 0;
    if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
      return t("createReturn.errQtyPositive");
    }
    if (line.quantity > eligibleQuantity) {
      return t("createReturn.errQtyExceeds");
    }
    if (line.reason.length === 0) return t("createReturn.errReasonRequired");
    if (line.reason.length > MAX_REASON_LENGTH) return t("createReturn.errReasonTooLong");
    if (
      eligibility.policy.allowedReasons !== null &&
      !eligibility.policy.allowedReasons.includes(line.reason)
    ) {
      return t("createReturn.errReasonNotAllowed");
    }
  }

  if (requiresRestockLocation(lines) && !restockLocationId) {
    return t("createReturn.errRestockLocation");
  }

  return null;
}

export interface CreateReturnArgs {
  orderId: string;
  lines: readonly BuiltReturnLine[];
  /** Receiving location for restocked units; `null` when no line restocks. */
  inventoryLocationId: string | null;
}

/**
 * Create the return. The refund is always recorded in `pending` mode (settlement is a deliberate second
 * step via {@link submitSettleRefund}); the admin surface never auto-confirms a manual refund at
 * creation time. A restock receipt is created server-side when `inventoryLocationId` is supplied.
 */
export function submitCreateReturn(
  client: CreateReturnClient,
  args: CreateReturnArgs,
  idempotencyKey: string,
): Promise<ReturnDetailResponse> {
  return client.createReturn({
    orderId: args.orderId,
    idempotencyKey,
    lines: args.lines.map((line) => ({ ...line })),
    inventoryLocationId: args.inventoryLocationId,
    refundMode: "pending",
    settlementReference: null,
  });
}

export interface SettleRefundArgs {
  returnId: string;
  settlementReference: string;
}

/** Record that a pending manual refund has been paid out, with the operator's settlement reference. */
export function submitSettleRefund(
  client: SettleRefundClient,
  args: SettleRefundArgs,
  idempotencyKey: string,
): Promise<ReturnDetailResponse> {
  return client.settleRefund({
    returnId: args.returnId,
    idempotencyKey,
    settlementReference: args.settlementReference,
  });
}

/**
 * Whether a return's refund can be settled from the admin surface. Settlement records an out-of-band
 * manual payout, so it is offered only for a `pending`, non-`electronic` refund. The API still
 * authorizes the operation and enforces the policy's manual-refund limits; this is the client gate that
 * decides whether to show the affordance at all.
 */
export function canSettleRefund(refund: ReturnDetailResponse["refund"]): boolean {
  return refund.status === "pending" && refund.method !== "electronic";
}
