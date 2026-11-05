import type {
  CreatePromotionRequest,
  PromotionDetail,
  UpdatePromotionRequest,
} from "@shifted/clothing-commerce-sdk";

import { formatMinorToInput } from "../catalog/money";
import { OPERATING_CURRENCY } from "../commerce/currency";
import { formatPercentBasisPoints } from "./display";

export type PromotionLimitKind = "unlimited" | "single" | "custom";
export type PromotionChannelChoice = "all" | "pos" | "online";

export interface PromotionTargetChoice {
  target: NonNullable<CreatePromotionRequest["targets"]>[number];
  label: string;
}

/** UI state intentionally uses input strings; SDK request DTOs are built only at the submit boundary. */
export interface PromotionFormState {
  name: string;
  description: string;
  benefitType: CreatePromotionRequest["benefitType"];
  benefitValue: string;
  currency: string;
  targetType: CreatePromotionRequest["targetType"];
  activationType: CreatePromotionRequest["activationType"];
  minimumSubtotal: string;
  maximumDiscount: string;
  channel: PromotionChannelChoice;
  brandId: string;
  branchId: string;
  startsAt: string;
  endsAt: string;
  globalLimit: string;
  status: NonNullable<CreatePromotionRequest["status"]>;
  targets: PromotionTargetChoice[];
  initialCode: string;
  codeLimitKind: PromotionLimitKind;
  codeCustomLimit: string;
}

export type PromotionFormErrors = Partial<Record<keyof PromotionFormState, string>>;

export const EMPTY_PROMOTION_FORM: PromotionFormState = {
  name: "",
  description: "",
  benefitType: "percentage",
  benefitValue: "",
  currency: OPERATING_CURRENCY,
  targetType: "order",
  activationType: "automatic",
  minimumSubtotal: "",
  maximumDiscount: "",
  channel: "all",
  brandId: "",
  branchId: "",
  startsAt: "",
  endsAt: "",
  globalLimit: "",
  status: "inactive",
  targets: [],
  initialCode: "",
  codeLimitKind: "unlimited",
  codeCustomLimit: "",
};

function parsePositiveInteger(value: string, label: string): number | string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return `Enter ${label} as a whole number.`;
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return `${label} must be greater than zero.`;
  return parsed;
}

/** Exact decimal-to-minor conversion, with optional zero support for minimum subtotal. */
export function parsePromotionMoney(
  value: string,
  label: string,
  allowZero: boolean,
): number | string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return `Enter ${label} as an amount, for example 25.00.`;
  const minor = Number(`${match[1]}${(match[2] ?? "").padEnd(2, "0")}`);
  if (!Number.isSafeInteger(minor)) return `${label} is too large.`;
  if (minor < 0 || (!allowZero && minor === 0)) {
    return `${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`;
  }
  return minor;
}

export function parsePercent(value: string): number | string {
  const trimmed = value.trim();
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) return "Enter a percentage from 0.01 to 100.";
  const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (basisPoints < 1 || basisPoints > 10_000) return "Enter a percentage from 0.01 to 100.";
  return basisPoints;
}

function parseDate(value: string, label: string): { iso: string | null; error?: string } {
  const trimmed = value.trim();
  if (trimmed === "") return { iso: null };
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return { iso: null, error: `Enter a valid ${label} date and time.` };
  }
  return { iso: date.toISOString() };
}

function codeLimit(state: PromotionFormState): number | string | null {
  if (state.codeLimitKind === "unlimited") return null;
  if (state.codeLimitKind === "single") return 1;
  return parsePositiveInteger(state.codeCustomLimit, "code redemption limit");
}

export function validatePromotionForm(
  state: PromotionFormState,
  mode: "create" | "edit",
  economicsLocked = false,
): PromotionFormErrors {
  const errors: PromotionFormErrors = {};
  const name = state.name.trim();
  if (!name) errors.name = "Promotion name is required.";
  else if (name.length > 200) errors.name = "Keep the name to 200 characters or fewer.";
  if (state.description.trim().length > 2000) {
    errors.description = "Keep the description to 2,000 characters or fewer.";
  }

  if (mode === "create" || !economicsLocked) {
    if (state.benefitType === "percentage") {
      const value = parsePercent(state.benefitValue);
      if (typeof value === "string") errors.benefitValue = value;
    } else {
      const value = parsePromotionMoney(state.benefitValue, "fixed discount", false);
      if (typeof value === "string" || value === null) {
        errors.benefitValue =
          typeof value === "string" ? value : "Enter the fixed discount amount.";
      }
      if (!/^[A-Z]{3}$/.test(state.currency.trim().toUpperCase())) {
        errors.currency = "Enter a three-letter currency code, for example EGP.";
      }
    }

    const minimum = parsePromotionMoney(state.minimumSubtotal, "minimum subtotal", true);
    if (typeof minimum === "string") errors.minimumSubtotal = minimum;
    const maximum = parsePromotionMoney(state.maximumDiscount, "maximum discount", false);
    if (typeof maximum === "string") errors.maximumDiscount = maximum;
  }

  if (mode === "create") {
    if (state.targetType === "variant_scope" && state.targets.length === 0) {
      errors.targets = "Select at least one Product or Variant target.";
    }
    const globalLimit = parsePositiveInteger(state.globalLimit, "global usage limit");
    if (typeof globalLimit === "string") errors.globalLimit = globalLimit;

    if (state.activationType === "code") {
      const code = state.initialCode.trim().toUpperCase();
      if (!code) errors.initialCode = "Add an initial Promotion code.";
      else if (!/^[A-Z0-9_-]+$/.test(code)) {
        errors.initialCode = "Use only letters, numbers, underscores, and hyphens.";
      }
      const limit = codeLimit(state);
      if (typeof limit === "string") errors.codeCustomLimit = limit;
    }
  }

  const startsAt = parseDate(state.startsAt, "start");
  if (startsAt.error) errors.startsAt = startsAt.error;
  const endsAt = parseDate(state.endsAt, "end");
  if (endsAt.error) errors.endsAt = endsAt.error;
  if (
    startsAt.iso &&
    endsAt.iso &&
    new Date(endsAt.iso).getTime() <= new Date(startsAt.iso).getTime()
  ) {
    errors.endsAt = "End must be after start.";
  }

  return errors;
}

function optionalMoney(value: string, label: string, allowZero: boolean): number | null {
  const parsed = parsePromotionMoney(value, label, allowZero);
  return typeof parsed === "number" ? parsed : null;
}

function optionalDate(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? new Date(trimmed).toISOString() : null;
}

export function buildCreatePromotionRequest(state: PromotionFormState): CreatePromotionRequest {
  const request: CreatePromotionRequest = {
    name: state.name.trim(),
    description: state.description.trim() || null,
    benefitType: state.benefitType,
    targetType: state.targetType,
    activationType: state.activationType,
    minSubtotalMinor: optionalMoney(state.minimumSubtotal, "minimum subtotal", true),
    maxDiscountMinor: optionalMoney(state.maximumDiscount, "maximum discount", false),
    startsAt: optionalDate(state.startsAt),
    endsAt: optionalDate(state.endsAt),
    channel: state.channel === "all" ? null : state.channel,
    brandId: state.brandId || null,
    branchId: state.branchId || null,
    globalRedemptionLimit:
      typeof parsePositiveInteger(state.globalLimit, "global usage limit") === "number"
        ? (parsePositiveInteger(state.globalLimit, "global usage limit") as number)
        : null,
    status: state.status,
  };

  if (state.benefitType === "percentage") {
    request.benefitPercentBp = parsePercent(state.benefitValue) as number;
  } else {
    request.benefitAmountMinor = optionalMoney(
      state.benefitValue,
      "fixed discount",
      false,
    ) as number;
    request.benefitCurrency = state.currency.trim().toUpperCase();
  }
  if (state.targetType === "variant_scope") {
    request.targets = state.targets.map(({ target }) => target);
  }
  if (state.activationType === "code") {
    const limit = codeLimit(state);
    request.codes = [
      {
        code: state.initialCode.trim().toUpperCase(),
        maxRedemptions: typeof limit === "number" ? limit : null,
      },
    ];
  }
  return request;
}

export function buildUpdatePromotionRequest(
  state: PromotionFormState,
  detail: PromotionDetail,
): UpdatePromotionRequest {
  const request: UpdatePromotionRequest = {
    name: state.name.trim(),
    description: state.description.trim() || null,
    startsAt: optionalDate(state.startsAt),
    endsAt: optionalDate(state.endsAt),
  };
  if (!detail.economicsLocked) {
    if (detail.benefitType === "percentage") {
      const benefitPercentBp = parsePercent(state.benefitValue) as number;
      if (benefitPercentBp !== detail.benefitPercentBp) {
        request.benefitPercentBp = benefitPercentBp;
      }
    } else {
      const benefitAmountMinor = optionalMoney(
        state.benefitValue,
        "fixed discount",
        false,
      ) as number;
      if (benefitAmountMinor !== detail.benefitAmountMinor) {
        request.benefitAmountMinor = benefitAmountMinor;
      }
    }
    const minSubtotalMinor = optionalMoney(state.minimumSubtotal, "minimum subtotal", true);
    if (minSubtotalMinor !== detail.minSubtotalMinor) {
      request.minSubtotalMinor = minSubtotalMinor;
    }
    const maxDiscountMinor = optionalMoney(state.maximumDiscount, "maximum discount", false);
    if (maxDiscountMinor !== detail.maxDiscountMinor) {
      request.maxDiscountMinor = maxDiscountMinor;
    }
    const channel = state.channel === "all" ? null : state.channel;
    if (channel !== detail.channel) request.channel = channel;
    const brandId = state.brandId || null;
    if (brandId !== detail.brandId) request.brandId = brandId;
    const branchId = state.branchId || null;
    if (branchId !== detail.branchId) request.branchId = branchId;
  }
  return request;
}

export function promotionDetailToForm(detail: PromotionDetail): PromotionFormState {
  return {
    ...EMPTY_PROMOTION_FORM,
    name: detail.name,
    description: detail.description ?? "",
    benefitType: detail.benefitType,
    benefitValue:
      detail.benefitType === "percentage"
        ? formatPercentBasisPoints(detail.benefitPercentBp ?? 0).replace("%", "")
        : formatMinorToInput(detail.benefitAmountMinor ?? 0),
    currency: detail.benefitCurrency ?? OPERATING_CURRENCY,
    targetType: detail.targetType,
    activationType: detail.activationType,
    minimumSubtotal:
      detail.minSubtotalMinor === null ? "" : formatMinorToInput(detail.minSubtotalMinor),
    maximumDiscount:
      detail.maxDiscountMinor === null ? "" : formatMinorToInput(detail.maxDiscountMinor),
    channel: detail.channel ?? "all",
    brandId: detail.brandId ?? "",
    branchId: detail.branchId ?? "",
    startsAt: detail.startsAt ?? "",
    endsAt: detail.endsAt ?? "",
    globalLimit: detail.globalRedemptionLimit === null ? "" : String(detail.globalRedemptionLimit),
    status: detail.status,
  };
}
