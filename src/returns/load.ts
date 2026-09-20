import type { ReturnDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";

import { collectAllPages, DEFAULT_MAX_PAGES } from "../commerce/pagination";

export type ReturnHistoryItem = ReturnDetailResponse;

/**
 * Safety bound on the number of return-history pages this read surface will follow. Mirrors the
 * orders/inventory loaders: the API terminates via `pageInfo.hasMore === false`; this cap only
 * prevents a pathological server from driving an unbounded request loop.
 */
export const MAX_RETURNS_PAGES = DEFAULT_MAX_PAGES;

/**
 * Loads the FULL return history for one order by following the SDK's cursor across every advertised
 * page (via the shared {@link collectAllPages} primitive), in server order. There is no global returns
 * list endpoint in the SDK, so history is always scoped to its original order — never reconstructed
 * from a client-side store. Bounded by {@link MAX_RETURNS_PAGES}.
 */
export function loadAllReturns(
  client: Pick<TenantCommerceClient, "listReturns">,
  orderId: string,
): Promise<ReturnDetailResponse[]> {
  return collectAllPages(
    (cursor) => client.listReturns(orderId, cursor ? { cursor } : {}),
    MAX_RETURNS_PAGES,
  );
}
