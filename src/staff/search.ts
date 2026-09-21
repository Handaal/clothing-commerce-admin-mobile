/**
 * Typed Staff search state and its mapping to a future server-side query.
 *
 * The eventual Staff API will own search (by display name / email) and status filtering server-side.
 * This module keeps a small, typed UI state and a pure translation into a request-shaped
 * {@link StaffListQuery}, so the SDK integration is a narrow "call the endpoint with this query" change.
 * It deliberately does NOT filter a client-side dataset — there is no fake production dataset to filter,
 * and real search must round-trip to the server.
 */

import type { MembershipStatus } from "./model";

/** All / active / suspended / deactivated — the status views the list can request. */
export type StaffStatusFilter = "all" | MembershipStatus;

export interface StaffSearchState {
  /** Raw text the user typed (matched by the server across display name / email). */
  term: string;
  status: StaffStatusFilter;
  /** Optional role filter (an adapter-provided role id, or "any"). */
  roleId: string | "any";
}

export const EMPTY_STAFF_SEARCH: StaffSearchState = { term: "", status: "all", roleId: "any" };

/**
 * A request-shaped query. Optional members are OMITTED when not constraining, so the adapter maps it
 * straight onto whatever query params the SDK exposes without translating empty strings. `cursor` is
 * supplied by the paginator, not the UI.
 */
export interface StaffListQuery {
  search?: string;
  status?: MembershipStatus;
  roleId?: string;
  cursor?: string;
}

export function isEmptyStaffSearch(state: StaffSearchState): boolean {
  return state.term.trim() === "" && state.status === "all" && state.roleId === "any";
}

/** Translate UI search state into a server query. Trims the term and drops non-constraining parts. */
export function buildStaffListQuery(state: StaffSearchState, cursor?: string): StaffListQuery {
  const query: StaffListQuery = {};
  const term = state.term.trim();
  if (term !== "") query.search = term;
  if (state.status !== "all") query.status = state.status;
  if (state.roleId !== "any") query.roleId = state.roleId;
  if (cursor) query.cursor = cursor;
  return query;
}

/** Typed eligible-identity search state for the Add-Staff selector. */
export interface EligibleIdentitySearchState {
  term: string;
}

export const EMPTY_ELIGIBLE_IDENTITY_SEARCH: EligibleIdentitySearchState = { term: "" };

/**
 * A request-shaped eligible-identity query. The identity-discovery contract is still being finalized by
 * the API workstream, so this is intentionally minimal (a search term + cursor) and lives behind the
 * adapter — the UI never guesses an endpoint or DTO. The `search` term is REQUIRED to be non-empty by
 * {@link buildEligibleIdentityQuery} returning `null`, so the app never bulk-lists every identity.
 */
export interface EligibleIdentityQuery {
  search: string;
  cursor?: string;
}

/**
 * Build an eligible-identity query, or `null` when there is nothing to search for. Returning `null`
 * (rather than an all-identities query) enforces "search, don't browse" — identity discovery is a
 * deliberate lookup, never an unbounded directory dump.
 */
export function buildEligibleIdentityQuery(
  state: EligibleIdentitySearchState,
  cursor?: string,
): EligibleIdentityQuery | null {
  const term = state.term.trim();
  if (term === "") return null;
  return cursor ? { search: term, cursor } : { search: term };
}
