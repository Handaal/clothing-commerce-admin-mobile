import {
  emptySaleForm,
  saleToForm as sdkSaleToForm,
  validateSaleForm as validateSaleIssues,
  type FormIssue,
  type Sale,
  type SaleFormState,
} from "@shifted/clothing-commerce-sdk";

import { OPERATING_CURRENCY } from "../commerce/currency";

/**
 * Sale editor. A sale lowers the ONLINE selling price of every product, one collection, or the chosen
 * products. The rules, request builders and price preview are the SDK's shared management form rules
 * (also used by the POS); this module keeps the app's wording. The API re-validates every rule.
 */
export {
  buildCreateSaleRequest,
  buildUpdateSaleRequest,
  previewSalePrice,
  type SaleFormState,
} from "@shifted/clothing-commerce-sdk";

export type SaleFormErrors = Partial<Record<keyof SaleFormState, string>>;

export const EMPTY_SALE_FORM: SaleFormState = emptySaleForm(OPERATING_CURRENCY);

function saleIssueMessage(field: keyof SaleFormState, issue: FormIssue): string {
  switch (issue.code) {
    case "required":
      return field === "name"
        ? "Give the sale a name."
        : field === "value"
          ? "Enter the amount off each item."
          : field === "collectionId"
            ? "Choose the collection on sale."
            : "Choose at least one product.";
    case "too_long":
      return "Keep the name to 200 characters or fewer.";
    case "percent_range":
      return "Enter a percentage from 0.01 to 100.";
    case "amount_format":
      return "Enter amount off as an amount, for example 25.00.";
    case "amount_too_large":
      return "amount off is too large.";
    case "amount_positive":
      return "amount off must be greater than zero.";
    case "date_invalid":
      return field === "startsAt"
        ? "Enter a valid start date, for example 2026-12-01 09:00."
        : "Enter a valid end date, for example 2026-12-31 23:59.";
    case "end_before_start":
      return "The sale must end after it starts.";
    default:
      return "Check this field.";
  }
}

export function validateSaleForm(state: SaleFormState): SaleFormErrors {
  const errors: SaleFormErrors = {};
  for (const [field, issue] of Object.entries(validateSaleIssues(state)) as [
    keyof SaleFormState,
    FormIssue | undefined,
  ][]) {
    if (issue) errors[field] = saleIssueMessage(field, issue);
  }
  return errors;
}

export function saleToForm(sale: Sale): SaleFormState {
  return sdkSaleToForm(sale, { currency: OPERATING_CURRENCY });
}
