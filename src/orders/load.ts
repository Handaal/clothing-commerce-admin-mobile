import type {
  OrderListQuery,
  OrderListResponse,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";

import { collectAllPages, DEFAULT_MAX_PAGES } from "../commerce/pagination";

export type OrderListItem = OrderListResponse["items"][number];

/**
 * Safety bound on the number of order pages the read surface will follow. Mirrors the inventory
 * loader: the API terminates via `pageInfo.hasMore === false`; this cap only prevents a pathological
 * server from driving an unbounded request loop.
 */
export const MAX_ORDERS_PAGES = DEFAULT_MAX_PAGES;

/**
 * Loads the FULL tenant-scoped orders list by following the SDK's cursor across every advertised
 * page (via the shared {@link collectAllPages} primitive), in server order. Page one is never
 * presented as the whole list. Bounded by {@link MAX_ORDERS_PAGES}.
 *
 * Plain producer (no React), passed to `useAsync` through a `useCallback` keyed on the tenant-scoped
 * client so it runs once per real input change and on explicit retry — never on every render.
 */
export function loadAllOrders(
  client: Pick<TenantCommerceClient, "listOrders">,
  query: OrderListQuery = {},
): Promise<OrderListItem[]> {
  return collectAllPages((cursor) => client.listOrders({ ...query, cursor }), MAX_ORDERS_PAGES);
}
