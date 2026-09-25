import type { PromotionDetail, PromotionSummary } from "@shifted/clothing-commerce-sdk";

import { formatMoneyMinor } from "../products/display";

export type PromotionEffectiveState = "active" | "inactive" | "scheduled" | "expired" | "exhausted";

export function promotionEffectiveState(
  promotion: Pick<PromotionDetail, "status" | "startsAt" | "endsAt" | "remainingRedemptions">,
  now = new Date(),
): PromotionEffectiveState {
  if (promotion.status === "inactive") return "inactive";
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > now.getTime())
    return "scheduled";
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() <= now.getTime()) return "expired";
  if (promotion.remainingRedemptions === 0) return "exhausted";
  return "active";
}

export function promotionSummaryState(promotion: PromotionSummary): PromotionEffectiveState {
  if (promotion.status === "inactive") return "inactive";
  if (
    promotion.globalRedemptionLimit !== null &&
    promotion.redemptionCount >= promotion.globalRedemptionLimit
  ) {
    return "exhausted";
  }
  return "active";
}

export function effectiveStateLabel(state: PromotionEffectiveState): string {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function activationLabel(value: PromotionDetail["activationType"]): string {
  return value === "automatic" ? "Automatic" : "Promotion code";
}

export function targetTypeLabel(value: PromotionDetail["targetType"]): string {
  return value === "order" ? "Whole order" : "Selected products / variants";
}

export function channelLabel(value: PromotionDetail["channel"]): string {
  if (value === "online") return "Online";
  if (value === "pos") return "POS";
  return "All channels";
}

export function formatPercentBasisPoints(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const fraction = String(basisPoints % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

export function benefitLabel(promotion: PromotionDetail | PromotionSummary): string {
  if (promotion.benefitType === "percentage") {
    return "benefitPercentBp" in promotion && promotion.benefitPercentBp !== null
      ? `${formatPercentBasisPoints(promotion.benefitPercentBp)} off`
      : "Percentage discount";
  }
  return "benefitAmountMinor" in promotion &&
    promotion.benefitAmountMinor !== null &&
    promotion.benefitCurrency !== null
    ? `${formatMoneyMinor(promotion.benefitAmountMinor, promotion.benefitCurrency)} off`
    : "Fixed amount discount";
}

export function usageLabel(redemptionCount: number, limit: number | null): string {
  return limit === null
    ? `${redemptionCount} redeemed · unlimited`
    : `${redemptionCount} redeemed · ${Math.max(0, limit - redemptionCount)} remaining`;
}

export function formatPromotionDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "No limit";
}

export function formatPromotionMoney(amountMinor: number | null, currency: string | null): string {
  if (amountMinor === null) return "None";
  return currency
    ? formatMoneyMinor(amountMinor, currency)
    : `${(amountMinor / 100).toFixed(2)} in order currency`;
}
