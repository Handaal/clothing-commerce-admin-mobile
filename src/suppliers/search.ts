/**
 * Typed Supplier search state and its mapping to a future server-side query.
 *
 * The eventual Supplier API will own search (by name / reference / phone / email) and status
 * filtering server-side. This module keeps a small, typed UI state and a pure translation into a
 * request-shaped {@link SupplierListQuery}, so the SDK integration is a narrow "call the endpoint
 * with this query" change. It deliberately does NOT filter a client-side dataset — there is no fake
 * production dataset to filter, and real search must round-trip to the server.
 */

import type { SupplierStatus } from "./model";

/** All / active / inactive — the three status views the list can request. */
export type SupplierStatusFilter = "all" | SupplierStatus;

export interface SupplierSearchState {
  /** Raw text the user typed (matched by the server across name/reference/phone/email). */
  term: string;
  status: SupplierStatusFilter;
}

export const EMPTY_SUPPLIER_SEARCH: SupplierSearchState = { term: "", status: "all" };

/**
 * A request-shaped query. Optional members are OMITTED when not constraining, so the adapter maps it
 * straight onto whatever query params the SDK exposes without translating empty strings. `cursor` is
 * supplied by the paginator, not the UI.
 */
export interface SupplierListQuery {
  search?: string;
  status?: SupplierStatus;
  cursor?: string;
}

export function isEmptySupplierSearch(state: SupplierSearchState): boolean {
  return state.term.trim() === "" && state.status === "all";
}

/** Translate UI search state into a server query. Trims the term and drops non-constraining parts. */
export function buildSupplierListQuery(
  state: SupplierSearchState,
  cursor?: string,
): SupplierListQuery {
  const query: SupplierListQuery = {};
  const term = state.term.trim();
  if (term !== "") query.search = term;
  if (state.status !== "all") query.status = state.status;
  if (cursor) query.cursor = cursor;
  return query;
}
