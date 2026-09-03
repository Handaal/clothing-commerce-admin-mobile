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
 * Thrown when the page bound is exhausted while the server still advertises more results. The load
 * FAILS CLOSED rather than returning the accumulated pages: a safety cap must never silently turn an
 * incomplete server result into a successful, complete-looking list. Callers surface this like any
 * other read failure (classified error + explicit retry) — never as partial success.
 */
export class PaginationCapExceededError extends Error {
  readonly maxPages: number;
  constructor(maxPages: number) {
    super(
      `Pagination exceeded the ${maxPages}-page safety cap while the server still reported more ` +
        `results; refusing to present a truncated list as complete.`,
    );
    this.name = "PaginationCapExceededError";
    this.maxPages = maxPages;
  }
}

/**
 * Loads the FULL result set by following the server's cursor until it reports no more pages, in
 * server order. Page one is never silently presented as the whole list. `fetchPage` receives the
 * cursor for the page to fetch (`undefined` for the first page).
 *
 * Bounded by `maxPages`. If that bound is reached while the server still reports another page, this
 * throws {@link PaginationCapExceededError} — it does NOT return the accumulated partial data, so a
 * truncated result can never masquerade as a complete one.
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

  // The loop only falls through here after fetching `maxPages` pages whose last one still reported
  // `hasMore` with a non-null cursor — i.e. the result is provably truncated. Fail closed.
  throw new PaginationCapExceededError(maxPages);
}
