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

// ---------------------------------------------------------------------------------------------------
// Add-Staff identity discovery — EXACT-EMAIL lookup (frozen V1 privacy decision)
// ---------------------------------------------------------------------------------------------------
//
// Add-Staff resolves an existing account by an EXACT email address. There is deliberately NO directory
// browse, NO display-name search, NO wildcard, and NO raw identity-UUID entry — those would let the
// screen enumerate who exists on the platform. The helpers below validate and normalize the operator's
// typed input at the UX level only (trim + lowercase for convenience); the eventual server stays the
// sole authority for matching and is NOT assumed to normalize the same way.

// Deliberately permissive local-part@domain.tld check, matching the supplier email gate. The API is
// authoritative — this only stops an obviously invalid string from reaching the lookup.
const EMAIL_LOOKUP_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim and lowercase typed input so casing/whitespace never causes a spurious miss. UX convenience only. */
export function normalizeEligibleEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** True when the (already-normalized) email is shaped like an address the lookup can be run with. */
export function isValidEligibleEmail(email: string): boolean {
  return EMAIL_LOOKUP_PATTERN.test(email);
}

/**
 * Prepare an exact-email lookup value from raw operator input, or `null` when it is not a valid email.
 * Returning `null` (rather than a wildcard/partial) enforces "look up an exact account, don't browse":
 * the adapter is only ever called with a single, validated, normalized email.
 */
export function buildEligibleEmailLookup(raw: string): string | null {
  const email = normalizeEligibleEmail(raw);
  return isValidEligibleEmail(email) ? email : null;
}
