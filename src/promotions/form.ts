import {
  emptyPromotionForm,
  parseMoneyInput,
  parsePercentInput,
  promotionToForm,
  validatePromotionForm as validatePromotionIssues,
  type FormIssue,
  type PromotionDetail,
  type PromotionFormState,
  type ValidatePromotionOptions,
} from "@shifted/clothing-commerce-sdk";

import { OPERATING_CURRENCY } from "../commerce/currency";

/**
 * Promotion form. The rules and request builders are the SDK's shared management form rules (also used
 * by the POS Website Management desk). Every setting is editable at any time, including after
 * redemption (owner decision 2026-11-18). This module keeps the app's wording for each issue.
 */
export {
  buildCreatePromotionRequest,
  buildUpdatePromotionRequest,
  promotionInitialCode,
  type PromotionChannelChoice,
  type PromotionFormState,
  type PromotionLimitKind,
  type PromotionTargetChoice,
} from "@shifted/clothing-commerce-sdk";

export type PromotionFormErrors = Partial<Record<keyof PromotionFormState, string>>;

export const EMPTY_PROMOTION_FORM: PromotionFormState = emptyPromotionForm(OPERATING_CURRENCY);

const FIELD_LABELS: Partial<Record<keyof PromotionFormState, string>> = {
  benefitValue: "fixed discount",
  minimumSubtotal: "minimum subtotal",
  maximumDiscount: "maximum discount",
  globalLimit: "global usage limit",
  codeCustomLimit: "code redemption limit",
  startsAt: "start",
  endsAt: "end",
};

const REQUIRED: Partial<Record<keyof PromotionFormState, string>> = {
  name: "Promotion name is required.",
  benefitValue: "Enter the fixed discount amount.",
  targets: "Select at least one Product or Variant target.",
  initialCode: "Add an initial Promotion code.",
};

/** The app's wording for an SDK form issue on one promotion field. */
export function promotionIssueMessage(field: keyof PromotionFormState, issue: FormIssue): string {
  const label = FIELD_LABELS[field] ?? "value";
  switch (issue.code) {
    case "required":
      return REQUIRED[field] ?? "This field is required.";
    case "too_long":
      return field === "description"
        ? "Keep the description to 2,000 characters or fewer."
        : `Keep the name to ${issue.max ?? 200} characters or fewer.`;
    case "percent_range":
      return "Enter a percentage from 0.01 to 100.";
    case "amount_format":
      return `Enter ${label} as an amount, for example 25.00.`;
    case "amount_too_large":
      return `${label} is too large.`;
    case "amount_positive":
      return `${label} must be greater than zero.`;
    case "amount_non_negative":
      return `${label} must be zero or greater.`;
    case "whole_number":
      return `Enter ${label} as a whole number.`;
    case "positive":
      return `${label} must be greater than zero.`;
    case "quantity_range":
      return "Enter a whole number from 1 to 100.";
    case "currency_format":
      return "Enter a three-letter currency code, for example EGP.";
    case "code_format":
      return "Use only letters, numbers, underscores, and hyphens.";
    case "date_invalid":
      return `Enter a valid ${label} date and time.`;
    case "end_before_start":
      return "End must be after start.";
    default:
      return "Check this field.";
  }
}

/** Percentage text → basis points, or the app's message. */
export function parsePercent(value: string): number | string {
  const parsed = parsePercentInput(value);
  return typeof parsed === "number" ? parsed : promotionIssueMessage("benefitValue", parsed);
}

/** Exact decimal → minor units (null when blank), or a message naming `label`. */
export function parsePromotionMoney(
  value: string,
  label: string,
  allowZero: boolean,
): number | string | null {
  const parsed = parseMoneyInput(value, allowZero);
  if (parsed === null || typeof parsed === "number") return parsed;
  switch (parsed.code) {
    case "amount_format":
      return `Enter ${label} as an amount, for example 25.00.`;
    case "amount_too_large":
      return `${label} is too large.`;
    default:
      return `${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`;
  }
}

export function validatePromotionForm(
  state: PromotionFormState,
  mode: "create" | "edit",
  options?: ValidatePromotionOptions,
): PromotionFormErrors {
  const errors: PromotionFormErrors = {};
  const issues = validatePromotionIssues(state, mode, options);
  for (const [field, issue] of Object.entries(issues) as [
    keyof PromotionFormState,
    FormIssue | undefined,
  ][]) {
    if (issue) errors[field] = promotionIssueMessage(field, issue);
  }
  return errors;
}

export function promotionDetailToForm(detail: PromotionDetail): PromotionFormState {
  return promotionToForm(detail, { currency: OPERATING_CURRENCY });
}
