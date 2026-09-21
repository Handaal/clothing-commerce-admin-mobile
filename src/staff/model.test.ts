import { describe, expect, it } from "vitest";

import { describeAssignment, isAddStaffComplete, type StaffAssignment } from "./model";

const assignment: StaffAssignment = {
  assignmentId: "a1",
  role: { id: "r1", label: "Branch Manager" },
  scope: { id: "s1", label: "Downtown Branch", kind: "branch", targets: [] },
};

describe("describeAssignment", () => {
  it("makes clear which role applies at which scope", () => {
    expect(describeAssignment(assignment)).toBe("Branch Manager at Downtown Branch");
  });
});

describe("isAddStaffComplete", () => {
  it("is false until all three ids are chosen", () => {
    expect(isAddStaffComplete({})).toBe(false);
    expect(isAddStaffComplete({ identityId: "i1" })).toBe(false);
    expect(isAddStaffComplete({ identityId: "i1", roleId: "r1" })).toBe(false);
  });

  it("is true only with identity, role and scope", () => {
    expect(isAddStaffComplete({ identityId: "i1", roleId: "r1", scopeId: "s1" })).toBe(true);
  });
});
