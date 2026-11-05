import type { PromotionDetail, PromotionSummary } from "@shifted/clothing-commerce-sdk";

import { t } from "../i18n";
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

const STATE_KEYS = {
  active: "promoState.active",
  inactive: "promoState.inactive",
  scheduled: "promoState.scheduled",
  expired: "promoState.expired",
  exhausted: "promoState.exhausted",
} as const;

export function effectiveStateLabel(state: PromotionEffectiveState): string {
  return t(STATE_KEYS[state]);
}

export function activationLabel(value: PromotionDetail["activationType"]): string {
  return value === "automatic" ? t("promoActivation.automatic") : t("promoActivation.code");
}

export function targetTypeLabel(value: PromotionDetail["targetType"]): string {
  return value === "order" ? t("promoTarget.order") : t("promoTarget.scope");
}

export function channelLabel(value: PromotionDetail["channel"]): string {
  if (value === "online") return t("promoChannel.online");
  if (value === "pos") return t("promoChannel.pos");
  return t("promoChannel.all");
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
      ? t("promoBenefit.percentOff", { percent: formatPercentBasisPoints(promotion.benefitPercentBp) })
      : t("promoBenefit.percentDiscount");
  }
  return "benefitAmountMinor" in promotion &&
    promotion.benefitAmountMinor !== null &&
    promotion.benefitCurrency !== null
    ? t("promoBenefit.amountOff", {
        amount: formatMoneyMinor(promotion.benefitAmountMinor, promotion.benefitCurrency),
      })
    : t("promoBenefit.fixedDiscount");
}

export function usageLabel(redemptionCount: number, limit: number | null): string {
  return limit === null
    ? t("promoUsage.unlimited", { count: redemptionCount })
    : t("promoUsage.limited", {
        count: redemptionCount,
        remaining: Math.max(0, limit - redemptionCount),
      });
}

export function formatPromotionDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : t("promoDate.noLimit");
}

export function formatPromotionMoney(amountMinor: number | null, currency: string | null): string {
  if (amountMinor === null) return t("promoMoney.none");
  return currency
    ? formatMoneyMinor(amountMinor, currency)
    : t("promoMoney.orderCurrency", { amount: (amountMinor / 100).toFixed(2) });
}
