// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import {
  ASSIGNMENT_A,
  MEMBERSHIP_STAFF_A,
  ROLE_MANAGER,
  SCOPE_TENANT,
  fakeStaffAdapter,
  staffAssignment,
  staffDetail,
} from "../test-support/fixtures";
import { PROVISIONAL_STAFF_ERROR_CODES } from "./write-errors";
import { StaffDetailScreen } from "./StaffDetailScreen";

afterEach(() => cleanup());

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

const noop = () => {};

describe("StaffDetailScreen", () => {
  it("renders the unavailable state (no fabricated staff) when there is no adapter", () => {
    render(
      <StaffDetailScreen
        adapter={null}
        membershipId={MEMBERSHIP_STAFF_A}
        canManage
        onBack={noop}
      />,
    );
    expect(screen.getByTestId("staff-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("staff-detail-status")).toBeNull();
  });

  it("renders identity, membership status and role+scope assignments coupled together", async () => {
    const adapter = fakeStaffAdapter({
      getStaff: async () =>
        staffDetail({
          status: "active",
          assignments: [
            staffAssignment({
              assignmentId: ASSIGNMENT_A,
              role: { id: ROLE_MANAGER, label: "Branch Manager" },
              scope: { id: SCOPE_TENANT, label: "Whole business", kind: "tenant", targets: [] },
            }),
          ],
        }),
    });
    render(
      <StaffDetailScreen
        adapter={adapter}
        membershipId={MEMBERSHIP_STAFF_A}
        canManage={false}
        onBack={noop}
      />,
    );
    // The name appears in both the header and the identity section.
    expect((await screen.findAllByText("Layla Hassan")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("staff-detail-status").textContent).toBe("Active");
    // The assignment shows the role and, coupled with it, the scope it applies at.
    const assignment = screen.getByTestId(`staff-assignment-${ASSIGNMENT_A}`);
    expect(assignment.textContent).toContain("Branch Manager");
    expect(assignment.textContent).toContain("Whole business");
    expect(assignment.textContent).toContain("Tenant-wide");
  });

  it("keeps a deactivated membership readable and offers no delete or lifecycle action", async () => {
    const adapter = fakeStaffAdapter({
      getStaff: async () => staffDetail({ status: "deactivated" }),
    });
    render(
      <StaffDetailScreen
        adapter={adapter}
        membershipId={MEMBERSHIP_STAFF_A}
        canManage
        onBack={noop}
      />,
    );
    // Still fully readable.
    expect((await screen.findAllByText("Layla Hassan")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("staff-detail-status").textContent).toBe("Deactivated");
    // Terminal: no lifecycle actions, and never a physical delete.
    expect(screen.getByTestId("staff-lifecycle-terminal")).toBeTruthy();
    expect(screen.queryByTestId("staff-lifecycle-deactivated")).toBeNull();
    expect(screen.queryByText(/^delete$/i)).toBeNull();
    expect(screen.queryByText(/permanently/i)).toBeNull();
  });

  it("suspends via a confirmed lifecycle action and re-reads the authoritative record", async () => {
    const getStaff = vi
      .fn()
      .mockResolvedValueOnce(staffDetail({ status: "active" }))
      .mockResolvedValueOnce(staffDetail({ status: "suspended" }));
    const updateMembershipStatus = vi.fn().mockResolvedValue(staffDetail({ status: "suspended" }));
    const adapter = fakeStaffAdapter({ getStaff, updateMembershipStatus });
    render(
      <StaffDetailScreen
        adapter={adapter}
        membershipId={MEMBERSHIP_STAFF_A}
        canManage
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    await screen.findByTestId("staff-detail-status");
    fireEvent.click(screen.getByTestId("staff-lifecycle-suspended"));
    await waitFor(() =>
      expect(updateMembershipStatus).toHaveBeenCalledWith(MEMBERSHIP_STAFF_A, "suspended", "K1"),
    );
    await waitFor(() => expect(getStaff).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/temporarily disabled/i)).toBeTruthy();
  });

  it("requires a second confirm press before deactivating (destructive)", async () => {
    const updateMembershipStatus = vi
      .fn()
      .mockResolvedValue(staffDetail({ status: "deactivated" }));
    const adapter = fakeStaffAdapter({
      getStaff: async () => staffDetail({ status: "active" }),
      updateMembershipStatus,
    });
    render(
      <StaffDetailScreen
        adapter={adapter}
        membershipId={MEMBERSHIP_STAFF_A}
        canManage
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    await screen.findByTestId("staff-detail-status");
    // First press only arms the confirm — no mutation yet.
    fireEvent.click(screen.getByTestId("staff-lifecycle-deactivated"));
    expect(updateMembershipStatus).not.toHaveBeenCalled();
    // Second press confirms.
    fireEvent.click(screen.getByTestId("staff-lifecycle-deactivated"));
    await waitFor(() =>
      expect(updateMembershipStatus).toHaveBeenCalledWith(MEMBERSHIP_STAFF_A, "deactivated", "K1"),
    );
  });

  it("unassigns a role+scope through the adapter after a confirm", async () => {
    const unassignRoleScope = vi.fn().mockResolvedValue(staffDetail({ assignments: [] }));
    const adapter = fakeStaffAdapter({
      getStaff: async () =>
        staffDetail({ assignments: [staffAssignment({ assignmentId: ASSIGNMENT_A })] }),
      unassignRoleScope,
    });
    render(
      <StaffDetailScreen
        adapter={adapter}
        membershipId={MEMBERSHIP_STAFF_A}
        canManage
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    await screen.findByTestId(`staff-assignment-${ASSIGNMENT_A}`);
    fireEvent.click(screen.getByTestId(`staff-assignment-unassign-${ASSIGNMENT_A}`));
    fireEvent.click(screen.getByTestId(`staff-assignment-unassign-${ASSIGNMENT_A}`));
    await waitFor(() =>
      expect(unassignRoleScope).toHaveBeenCalledWith(MEMBERSHIP_STAFF_A, ASSIGNMENT_A, "K1"),
    );
  });

  it("shows a protected assignment as non-actionable (no unassign control)", async () => {
    const adapter = fakeStaffAdapter({
      getStaff: async () =>
        staffDetail({
          assignments: [staffAssignment({ assignmentId: ASSIGNMENT_A, isProtected: true })],
        }),
    });
    render(
      <StaffDetailScreen
        adapter={adapter}
        membershipId={MEMBERSHIP_STAFF_A}
        canManage
        onBack={noop}
      />,
    );
    expect(await screen.findByTestId(`staff-assignment-protected-${ASSIGNMENT_A}`)).toBeTruthy();
    expect(screen.queryByTestId(`staff-assignment-unassign-${ASSIGNMENT_A}`)).toBeNull();
  });

  it("assigns a new role+scope and surfaces an anti-escalation refusal distinctly", async () => {
    const assignRoleScope = vi
      .fn()
      .mockRejectedValue(
        new ApiHttpError("no", 403, PROVISIONAL_STAFF_ERROR_CODES.cannotDelegate, null),
      );
    const adapter = fakeStaffAdapter({
      getStaff: async () => staffDetail({ status: "active", assignments: [] }),
      assignRoleScope,
    });
    render(
      <StaffDetailScreen
        adapter={adapter}
        membershipId={MEMBERSHIP_STAFF_A}
        canManage
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    await screen.findByTestId("staff-add-assignment");
    // Choose the first assignable role and scope, then submit.
    fireEvent.click(await screen.findByTestId(`staff-add-role-${ROLE_MANAGER}`));
    fireEvent.click(screen.getByTestId(`staff-add-scope-${SCOPE_TENANT}`));
    fireEvent.click(screen.getByTestId("staff-add-assignment-submit"));
    await waitFor(() =>
      expect(assignRoleScope).toHaveBeenCalledWith(
        MEMBERSHIP_STAFF_A,
        { roleId: ROLE_MANAGER, scopeId: SCOPE_TENANT },
        "K1",
      ),
    );
    // The server's anti-escalation refusal is shown distinctly — never a silent success.
    expect(await screen.findByText("Not allowed to delegate this")).toBeTruthy();
  });

  it("hides all management controls for a read-only caller (record still readable)", async () => {
    const adapter = fakeStaffAdapter({
      getStaff: async () => staffDetail({ status: "active", assignments: [staffAssignment()] }),
    });
    render(
      <StaffDetailScreen
        adapter={adapter}
        membershipId={MEMBERSHIP_STAFF_A}
        canManage={false}
        onBack={noop}
      />,
    );
    await screen.findByTestId("staff-detail-status");
    expect(screen.queryByTestId("staff-lifecycle-actions")).toBeNull();
    expect(screen.queryByTestId("staff-add-assignment")).toBeNull();
    expect(screen.queryByTestId(`staff-assignment-unassign-${ASSIGNMENT_A}`)).toBeNull();
  });
});
