/**
 * Bounded, cursor-following loader for the Staff list, reusing the shared pagination primitive so it
 * inherits the fail-closed cap (never present a truncated list as complete). Search/status/role
 * constraints ride in the server query — there is no client-side filtering of a fabricated dataset.
 * (Add-Staff identity discovery is a single exact-email lookup, not a paged list — see `adapter.ts`.)
 */

import { collectAllPages, DEFAULT_MAX_PAGES } from "../commerce/pagination";
import type { StaffAdapter } from "./adapter";
import type { StaffSummary } from "./model";
import type { StaffListQuery } from "./search";

export const MAX_STAFF_PAGES = DEFAULT_MAX_PAGES;

/** Load the full staff list for a query by following the server cursor across every page. */
export function loadAllStaff(
  adapter: StaffAdapter,
  query: StaffListQuery,
): Promise<StaffSummary[]> {
  return collectAllPages(
    (cursor) => adapter.listStaff({ ...query, ...(cursor ? { cursor } : {}) }),
    MAX_STAFF_PAGES,
  );
}
