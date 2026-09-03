/**
 * Shared cursor-pagination primitive for the read surfaces. The SDK's list endpoints all return the
 * same `{ items, pageInfo: { nextCursor, hasMore } }` envelope, so the logic of "follow the cursor
 * across every advertised page, bounded" lives here once instead of being re-derived per feature.
 */

export interface CursorPage<TItem> {
  items: TItem[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

/**
 * Default safety bound on the number of pages any read surface will follow. A well-behaved API
 * terminates via `hasMore === false` long before this; the cap only guards against a pathological
 * server that never stops advancing the cursor, so a load can never become an infinite request loop.
 */
export const DEFAULT_MAX_PAGES = 50;

/**
 * Loads the FULL result set by following the server's cursor until it reports no more pages, in
 * server order. Page one is never silently presented as the whole list. `fetchPage` receives the
 * cursor for the page to fetch (`undefined` for the first page). Bounded by `maxPages`.
 */
export async function collectAllPages<TItem>(
  fetchPage: (cursor: string | undefined) => Promise<CursorPage<TItem>>,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | undefined = undefined;

  for (let page = 0; page < maxPages; page++) {
    const response = await fetchPage(cursor);
    items.push(...response.items);

    // Completion is server-driven: stop as soon as there is no next page (either flag or cursor).
    if (!response.pageInfo.hasMore || response.pageInfo.nextCursor === null) {
      return items;
    }
    cursor = response.pageInfo.nextCursor;
  }

  return items;
}
