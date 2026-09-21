import { describe, expect, it } from "vitest";

import {
  describeMembershipStatus,
  membershipLifecycleActions,
  membershipStatusLabel,
  staffStatusFilterLabel,
} from "./status";

describe("membershipStatusLabel", () => {
  it("labels each lifecycle state", () => {
    expect(membershipStatusLabel("active")).toBe("Active");
    expect(membershipStatusLabel("suspended")).toBe("Suspended");
    expect(membershipStatusLabel("deactivated")).toBe("Deactivated");
  });
});

describe("describeMembershipStatus", () => {
  it("states deactivated is retained, never deleted", () => {
    expect(describeMembershipStatus("deactivated")).toMatch(/retained/i);
    expect(describeMembershipStatus("deactivated")).toMatch(/never deleted/i);
  });

  it("states suspended is reversible", () => {
    expect(describeMembershipStatus("suspended")).toMatch(/restored|temporarily/i);
  });
});

describe("membershipLifecycleActions", () => {
  it("offers suspend + deactivate from active, with deactivate marked destructive", () => {
    const actions = membershipLifecycleActions("active");
    expect(actions.map((a) => a.next)).toEqual(["suspended", "deactivated"]);
    expect(actions.find((a) => a.next === "deactivated")?.destructive).toBe(true);
    expect(actions.find((a) => a.next === "suspended")?.destructive).toBe(false);
  });

  it("offers restore + deactivate from suspended", () => {
    expect(membershipLifecycleActions("suspended").map((a) => a.next)).toEqual([
      "active",
      "deactivated",
    ]);
  });

  it("offers NO lifecycle action from deactivated (terminal; no physical delete)", () => {
    expect(membershipLifecycleActions("deactivated")).toEqual([]);
  });
});

describe("staffStatusFilterLabel", () => {
  it("labels the filter values including All", () => {
    expect(staffStatusFilterLabel("all")).toBe("All");
    expect(staffStatusFilterLabel("deactivated")).toBe("Deactivated");
  });
});
