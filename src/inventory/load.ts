import type {
  InventoryListQuery,
  InventoryListResponse,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";

export type InventoryItem = InventoryListResponse["items"][number];

/**
 * Safety bound on the number of pages the read surface will follow. A well-behaved API terminates
 * via `pageInfo.hasMore === false` long before this; the cap exists only so a pathological server
 * that keeps advancing the cursor can never cause an unbounded request loop. It is NOT a
 * page-one-only shortcut — see {@link loadAllInventory}.
 */
export const MAX_INVENTORY_PAGES = 50;

/**
 * Loads the FULL tenant-scoped inventory by following the SDK's cursor until the server reports no
 * more pages. Page one is never silently presented as the whole inventory; every advertised page is
 * fetched and its items accumulated in server order. Bounded by {@link MAX_INVENTORY_PAGES} so a
 * misbehaving server cannot drive an infinite pagination loop.
 *
 * This is a plain producer (no React), so it is unit-testable in isolation and is passed to
 * `useAsync` via a `useCallback` keyed on the tenant-scoped client — one bounded load per real input
 * change and on explicit retry, never on every render.
 */
export async function loadAllInventory(
  client: Pick<TenantCommerceClient, "listInventory">,
  query: InventoryListQuery = {},
): Promise<InventoryItem[]> {
  const items: InventoryItem[] = [];
  let cursor: string | undefined = query.cursor;

  for (let page = 0; page < MAX_INVENTORY_PAGES; page++) {
    const response = await client.listInventory({ ...query, cursor });
    items.push(...response.items);

    // Completion is server-driven: stop as soon as there is no next page (either flag or cursor).
    if (!response.pageInfo.hasMore || response.pageInfo.nextCursor === null) {
      return items;
    }
    cursor = response.pageInfo.nextCursor;
  }

  return items;
}
