import type { TenantCommerceClient } from "@shifted/clothing-commerce-sdk";

/** SDK-owned Promotion and Catalog methods used by this feature. No wire DTO is duplicated locally. */
export type PromotionClient = Pick<
  TenantCommerceClient,
  | "listPromotions"
  | "getPromotion"
  | "createPromotion"
  | "updatePromotion"
  | "setPromotionStatus"
  | "createPromotionCode"
  | "setPromotionCodeStatus"
  | "listProducts"
  | "getProduct"
>;
