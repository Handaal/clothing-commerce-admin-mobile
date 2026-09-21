import { describe, expect, it } from "vitest";

import {
  buildSupplierListQuery,
  EMPTY_SUPPLIER_SEARCH,
  isEmptySupplierSearch,
  type SupplierSearchState,
} from "./search";

function state(overrides: Partial<SupplierSearchState> = {}): SupplierSearchState {
  return { ...EMPTY_SUPPLIER_SEARCH, ...overrides };
}

describe("isEmptySupplierSearch", () => {
  it("is empty for the default state", () => {
    expect(isEmptySupplierSearch(EMPTY_SUPPLIER_SEARCH)).toBe(true);
    expect(isEmptySupplierSearch(state({ term: "   " }))).toBe(true);
  });

  it("is not empty once a term or status constrains it", () => {
    expect(isEmptySupplierSearch(state({ term: "nile" }))).toBe(false);
    expect(isEmptySupplierSearch(state({ status: "inactive" }))).toBe(false);
  });
});

describe("buildSupplierListQuery", () => {
  it("omits non-constraining parts entirely (no empty strings)", () => {
    expect(buildSupplierListQuery(EMPTY_SUPPLIER_SEARCH)).toEqual({});
  });

  it("trims the term and maps status into a request-shaped query", () => {
    expect(buildSupplierListQuery(state({ term: "  nile  ", status: "active" }))).toEqual({
      search: "nile",
      status: "active",
    });
  });

  it("keeps status:all out of the query (it is the unconstrained default)", () => {
    expect(buildSupplierListQuery(state({ term: "nile", status: "all" }))).toEqual({
      search: "nile",
    });
  });

  it("threads a cursor when the paginator supplies one", () => {
    expect(buildSupplierListQuery(state({ term: "nile" }), "CUR")).toEqual({
      search: "nile",
      cursor: "CUR",
    });
  });
});
