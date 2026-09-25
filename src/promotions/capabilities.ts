import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

export interface PromotionCapabilities {
  canRead: boolean;
  canManage: boolean;
}

/**
 * Reads the optional Promotion guidance returned by `/me/context`. These booleans are deliberately
 * independent: manage never implies read. They control affordances only; every request is still
 * authorized by the Commerce API.
 */
export function promotionCapabilities(context: MeContextResponse): PromotionCapabilities {
  const promotions = context.access.promotions;
  return {
    canRead: promotions?.canRead ?? false,
    canManage: promotions?.canManage ?? false,
  };
}
