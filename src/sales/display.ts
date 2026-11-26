import type { Sale } from "@shifted/clothing-commerce-sdk";

import { t } from "../i18n";
import { formatMoneyMinor } from "../products/display";
import { formatPercentBasisPoints } from "../promotions/display";

export type SaleLiveState = "live" | "scheduled" | "ended" | "paused";

/** Derived state: persisted status is only active/inactive; the window decides the rest. */
export function saleLiveState(
  sale: Pick<Sale, "status" | "startsAt" | "endsAt">,
  now = new Date(),
) {
  if (sale.status === "inactive") return "paused" as const;
  if (sale.startsAt && Date.parse(sale.startsAt) > now.getTime()) return "scheduled" as const;
  if (sale.endsAt && Date.parse(sale.endsAt) <= now.getTime()) return "ended" as const;
  return "live" as const;
}

export function saleStateLabel(state: SaleLiveState): string {
  return t(`sales.state.${state}`);
}

export function saleStateTone(state: SaleLiveState): "success" | "neutral" | "warning" {
  return state === "live" ? "success" : state === "scheduled" ? "warning" : "neutral";
}

export function saleBenefitLabel(
  sale: Pick<Sale, "benefitType" | "benefitPercentBp" | "benefitAmountMinor" | "benefitCurrency">,
) {
  if (sale.benefitType === "percentage") {
    return t("sales.percentOff", { percent: formatPercentBasisPoints(sale.benefitPercentBp ?? 0) });
  }
  return t("sales.amountOff", {
    amount: formatMoneyMinor(sale.benefitAmountMinor ?? 0, sale.benefitCurrency ?? ""),
  });
}

export function saleScopeLabel(
  sale: Pick<Sale, "scope" | "productIds">,
  collectionName?: string,
): string {
  if (sale.scope === "all") return t("sales.scopeAllShort");
  if (sale.scope === "collection") {
    return t("sales.scopeCollectionShort", { name: collectionName ?? t("sales.aCollection") });
  }
  return t("sales.scopeProductsShort", { count: sale.productIds.length });
}
