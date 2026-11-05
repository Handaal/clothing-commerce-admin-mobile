import type {
  SupplierDue,
  SupplierPayment,
  SupplierPurchase,
  SupplierPurchaseItem,
  SupplierReminder,
  SupplierReminderStatus,
} from "@shifted/clothing-commerce-sdk";

import { parseAmountToMinor } from "../catalog/money";
import { t } from "../i18n";

/**
 * Supplier accounts-payable ledger: the management-side counterpart of the POS supplier desk. Purchases
 * accrue what is owed, payments settle it, dues summarize the outstanding balance, and reminders track
 * upcoming settlements. These are the local re-exports every ledger screen depends on (screens never
 * import the SDK directly) plus the React-free validation/mapping the forms share.
 */
export type {
  SupplierDue,
  SupplierPayment,
  SupplierPurchase,
  SupplierPurchaseItem,
  SupplierReminder,
  SupplierReminderStatus,
};

// ---------------------------------------------------------------------------------------------------
// Record a purchase
// ---------------------------------------------------------------------------------------------------

/** One caller-owned purchase line draft; raw strings are parsed and validated before submission. */
export interface PurchaseLineDraft {
  variantId: string | null;
  quantity: string;
  unitCost: string;
}

/** A purchase line in the shape the API accepts. */
export interface PurchaseLineInput {
  variantId: string;
  quantity: number;
  unitCostMinor: number;
}

export interface RecordPurchaseArgs {
  supplierId: string;
  inventoryLocationId: string;
  lines: PurchaseLineInput[];
  supplierReference?: string;
  paidMinor?: number;
  notes?: string;
}

/** A fresh, empty purchase line for the form. */
export function emptyPurchaseLine(): PurchaseLineDraft {
  return { variantId: null, quantity: "", unitCost: "" };
}

/**
 * Parse the purchase-line drafts into the API shape, dropping blank rows (no variant chosen). Invalid
 * numeric fields become `NaN`/sentinel values here and are rejected by {@link validatePurchaseDraft};
 * parsing and validation therefore share one interpretation of the raw input.
 */
export function buildPurchaseLines(drafts: readonly PurchaseLineDraft[]): PurchaseLineInput[] {
  return drafts.flatMap((draft) => {
    if (!draft.variantId) return [];
    const quantity = Number(draft.quantity);
    const unitCost = parseAmountToMinor(draft.unitCost);
    return [
      {
        variantId: draft.variantId,
        quantity,
        unitCostMinor: unitCost.ok ? unitCost.amountMinor : Number.NaN,
      },
    ];
  });
}

/** Validate a purchase draft. Returns `null` when submittable; otherwise a human message. */
export function validatePurchaseDraft(args: {
  inventoryLocationId: string | null;
  lines: readonly PurchaseLineInput[];
}): string | null {
  if (!args.inventoryLocationId) return t("supLedger.errLocation");
  if (args.lines.length === 0) return t("supLedger.errNoLines");
  for (const line of args.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      return t("supLedger.errQty");
    }
    if (!Number.isSafeInteger(line.unitCostMinor) || line.unitCostMinor <= 0) {
      return t("supLedger.errUnitCost");
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Record a payment
// ---------------------------------------------------------------------------------------------------

export interface RecordPaymentArgs {
  amountMinor: number;
  notes?: string;
}

/** Parse + validate a payment amount. Returns the minor amount or a message. */
export function parsePaymentAmount(input: string): { ok: true; amountMinor: number } | { ok: false; error: string } {
  const parsed = parseAmountToMinor(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, amountMinor: parsed.amountMinor };
}

// ---------------------------------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------------------------------

export interface ReminderDraft {
  dueDate: string; // ISO date "YYYY-MM-DD"
  amount: string; // optional major-unit amount
  note: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate a reminder draft. Returns `null` when submittable; otherwise a message. */
export function validateReminderDraft(draft: ReminderDraft): string | null {
  if (!ISO_DATE.test(draft.dueDate.trim())) return t("supLedger.errDueDate");
  const date = new Date(`${draft.dueDate.trim()}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return t("supLedger.errDueDate");
  if (draft.amount.trim()) {
    const parsed = parseAmountToMinor(draft.amount);
    if (!parsed.ok) return parsed.error;
  }
  return null;
}

/** Project a reminder draft into the optional `amountMinor`, or `undefined` when left blank. */
export function reminderAmountMinor(draft: ReminderDraft): number | undefined {
  if (!draft.amount.trim()) return undefined;
  const parsed = parseAmountToMinor(draft.amount);
  return parsed.ok ? parsed.amountMinor : undefined;
}
