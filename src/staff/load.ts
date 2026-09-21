/**
 * Bounded, cursor-following loaders for the Staff surfaces, reusing the shared pagination primitive so
 * they inherit its fail-closed cap (never present a truncated list as complete). Search/status/role
 * constraints ride in the server query — there is no client-side filtering of a fabricated dataset.
 */

import { collectAllPages, DEFAULT_MAX_PAGES } from "../commerce/pagination";
import type { StaffAdapter } from "./adapter";
import type { EligibleIdentity, StaffSummary } from "./model";
import type { EligibleIdentityQuery, StaffListQuery } from "./search";

export const MAX_STAFF_PAGES = DEFAULT_MAX_PAGES;
export const MAX_ELIGIBLE_IDENTITY_PAGES = DEFAULT_MAX_PAGES;

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

/** Load the full eligible-identity result for a search query, in server order. */
export function loadAllEligibleIdentities(
  adapter: StaffAdapter,
  query: EligibleIdentityQuery,
): Promise<EligibleIdentity[]> {
  return collectAllPages(
    (cursor) => adapter.searchEligibleIdentities({ ...query, ...(cursor ? { cursor } : {}) }),
    MAX_ELIGIBLE_IDENTITY_PAGES,
  );
}
