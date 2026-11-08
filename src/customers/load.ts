import type {
  CustomerOrdersResponse,
  CustomerSummary,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";

import { collectAllPages, DEFAULT_MAX_PAGES } from "../commerce/pagination";

export type CustomerOrderItem = CustomerOrdersResponse["items"][number];

export const MAX_CUSTOMER_PAGES = DEFAULT_MAX_PAGES;
export const MAX_CUSTOMER_ORDER_PAGES = DEFAULT_MAX_PAGES;

/**
 * Load the full customer directory for a search by following the server cursor across every page. The
 * optional `search` constraint rides in the server query — there is no client-side filtering of a
 * fabricated dataset. Bounded by {@link MAX_CUSTOMER_PAGES}.
 */
export function loadAllCustomers(
  client: Pick<TenantCommerceClient, "listCustomers">,
  search: string,
): Promise<CustomerSummary[]> {
  const term = search.trim();
  return collectAllPages(
    (cursor) =>
      client.listCustomers({
        ...(term ? { search: term } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    MAX_CUSTOMER_PAGES,
  );
}

/** Load a customer's full order history, newest-first in server order. Bounded by the page cap. */
export function loadAllCustomerOrders(
  client: Pick<TenantCommerceClient, "listCustomerOrders">,
  customerId: string,
): Promise<CustomerOrderItem[]> {
  return collectAllPages(
    (cursor) => client.listCustomerOrders(customerId, cursor ? { cursor } : {}),
    MAX_CUSTOMER_ORDER_PAGES,
  );
}
