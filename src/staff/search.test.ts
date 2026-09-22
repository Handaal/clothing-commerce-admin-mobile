import { describe, expect, it } from "vitest";

import {
  buildEligibleEmailLookup,
  buildStaffListQuery,
  EMPTY_STAFF_SEARCH,
  isEmptyStaffSearch,
  isValidEligibleEmail,
  normalizeEligibleEmail,
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

describe("normalizeEligibleEmail", () => {
  it("trims and lowercases operator input (UX convenience only)", () => {
    expect(normalizeEligibleEmail("  Omar@Acme.Example  ")).toBe("omar@acme.example");
  });
});

describe("isValidEligibleEmail", () => {
  it("accepts an address-shaped value", () => {
    expect(isValidEligibleEmail("omar@acme.example")).toBe(true);
  });

  it("rejects non-address input — a display name or a bare UUID is never a valid lookup", () => {
    expect(isValidEligibleEmail("omar")).toBe(false);
    expect(isValidEligibleEmail("omar@acme")).toBe(false);
    // A display-name search (has a space, no @) can never be run as an email lookup.
    expect(isValidEligibleEmail("Omar Fathy")).toBe(false);
    // A raw identity UUID (no @) can never be run as an email lookup.
    expect(isValidEligibleEmail("11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(isValidEligibleEmail("")).toBe(false);
  });
});

describe("buildEligibleEmailLookup", () => {
  it("returns the normalized email for valid input (exact lookup, never a browse)", () => {
    expect(buildEligibleEmailLookup("  Omar@Acme.Example ")).toBe("omar@acme.example");
  });

  it("returns null for invalid input so the adapter is never called with a non-email", () => {
    expect(buildEligibleEmailLookup("   ")).toBeNull();
    expect(buildEligibleEmailLookup("not-an-email")).toBeNull();
    expect(buildEligibleEmailLookup("omar*")).toBeNull();
  });
});
