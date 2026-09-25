import type { ProductListResponse, PromotionSummary } from "@shifted/clothing-commerce-sdk";

import { DEFAULT_MAX_PAGES, PaginationCapExceededError } from "../commerce/pagination";
import type { PromotionClient } from "./client";

export const PROMOTION_PAGE_SIZE = 100;
export const MAX_PROMOTION_PAGES = DEFAULT_MAX_PAGES;

/** Load every Promotion through the SDK's offset list, failing closed at the shared safety bound. */
export async function loadAllPromotions(
  client: Pick<PromotionClient, "listPromotions">,
  maxPages = MAX_PROMOTION_PAGES,
): Promise<PromotionSummary[]> {
  const items: PromotionSummary[] = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page++) {
    const response = await client.listPromotions({
      limit: PROMOTION_PAGE_SIZE,
      offset,
    });
    items.push(...response.items);
    offset += response.items.length;
    if (items.length >= response.total) return items;
    if (response.items.length === 0) {
      throw new Error("Promotion pagination stopped before the reported total was loaded.");
    }
  }

  throw new PaginationCapExceededError(maxPages);
}

/** Load canonical Products for target selection, following the existing cursor contract to completion. */
export async function loadAllPromotionProducts(
  client: Pick<PromotionClient, "listProducts">,
  maxPages = DEFAULT_MAX_PAGES,
): Promise<ProductListResponse["items"]> {
  const items: ProductListResponse["items"] = [];
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const response = await client.listProducts({ limit: 100, ...(cursor ? { cursor } : {}) });
    items.push(...response.items);
    if (!response.pageInfo.hasMore || response.pageInfo.nextCursor === null) return items;
    cursor = response.pageInfo.nextCursor;
  }

  throw new PaginationCapExceededError(maxPages);
}
