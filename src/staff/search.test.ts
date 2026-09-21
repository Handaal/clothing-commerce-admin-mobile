import { describe, expect, it } from "vitest";

import {
  buildEligibleIdentityQuery,
  buildStaffListQuery,
  EMPTY_ELIGIBLE_IDENTITY_SEARCH,
  EMPTY_STAFF_SEARCH,
  isEmptyStaffSearch,
} from "./search";

describe("buildStaffListQuery", () => {
  it("omits every non-constraining part for the empty search", () => {
    expect(buildStaffListQuery(EMPTY_STAFF_SEARCH)).toEqual({});
  });

  it("trims the term and maps status + role into a server query", () => {
    expect(
      buildStaffListQuery({ term: "  layla ", status: "suspended", roleId: "role-1" }),
    ).toEqual({ search: "layla", status: "suspended", roleId: "role-1" });
  });

  it("carries the paginator cursor when supplied", () => {
    expect(buildStaffListQuery(EMPTY_STAFF_SEARCH, "cur-2")).toEqual({ cursor: "cur-2" });
  });

  it("does not emit status/role for the 'all'/'any' selections", () => {
    expect(buildStaffListQuery({ term: "", status: "all", roleId: "any" })).toEqual({});
  });
});

describe("isEmptyStaffSearch", () => {
  it("treats whitespace, all-status and any-role as empty", () => {
    expect(isEmptyStaffSearch({ term: "   ", status: "all", roleId: "any" })).toBe(true);
  });

  it("is non-empty once any facet constrains", () => {
    expect(isEmptyStaffSearch({ term: "x", status: "all", roleId: "any" })).toBe(false);
    expect(isEmptyStaffSearch({ term: "", status: "active", roleId: "any" })).toBe(false);
    expect(isEmptyStaffSearch({ term: "", status: "all", roleId: "r1" })).toBe(false);
  });
});

describe("buildEligibleIdentityQuery", () => {
  it("returns null for an empty term (search, don't browse the whole directory)", () => {
    expect(buildEligibleIdentityQuery(EMPTY_ELIGIBLE_IDENTITY_SEARCH)).toBeNull();
    expect(buildEligibleIdentityQuery({ term: "   " })).toBeNull();
  });

  it("trims and includes the cursor only when present", () => {
    expect(buildEligibleIdentityQuery({ term: " omar " })).toEqual({ search: "omar" });
    expect(buildEligibleIdentityQuery({ term: "omar" }, "cur-1")).toEqual({
      search: "omar",
      cursor: "cur-1",
    });
  });
});
