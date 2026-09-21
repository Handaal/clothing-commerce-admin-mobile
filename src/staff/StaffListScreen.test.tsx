// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MEMBERSHIP_STAFF_A,
  MEMBERSHIP_STAFF_B,
  ROLE_MANAGER,
  fakeStaffAdapter,
  roleOption,
  staffSummary,
} from "../test-support/fixtures";
import { StaffListScreen } from "./StaffListScreen";

afterEach(() => cleanup());

function page(items = [staffSummary()], pageInfo = {}) {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

const noop = () => {};

describe("StaffListScreen", () => {
  it("renders an explicit unavailable state (no fake rows) when there is no adapter", () => {
    render(
      <StaffListScreen
        adapter={null}
        canManage
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    expect(screen.getByTestId("staff-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("staff-search-submit")).toBeNull();
    expect(screen.queryByTestId(`staff-row-${MEMBERSHIP_STAFF_A}`)).toBeNull();
  });

  it("shows a loading state while staff are fetched", () => {
    const adapter = fakeStaffAdapter({ listStaff: () => new Promise(() => {}) });
    render(
      <StaffListScreen
        adapter={adapter}
        canManage
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    expect(screen.getByText("Loading staff…")).toBeTruthy();
  });

  it("renders a populated list with a status badge, role summary and scope summary per row", async () => {
    const adapter = fakeStaffAdapter({
      listStaff: async () =>
        page([
          staffSummary({
            membershipId: MEMBERSHIP_STAFF_A,
            displayName: "Layla",
            status: "active",
          }),
          staffSummary({
            membershipId: MEMBERSHIP_STAFF_B,
            displayName: "Omar",
            status: "deactivated",
          }),
        ]),
    });
    render(
      <StaffListScreen
        adapter={adapter}
        canManage
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByText("Layla")).toBeTruthy();
    expect(screen.getByTestId(`staff-status-${MEMBERSHIP_STAFF_A}`).textContent).toBe("Active");
    // Deactivated staff remain listed — retained history, never hidden as if deleted.
    expect(screen.getByTestId(`staff-status-${MEMBERSHIP_STAFF_B}`).textContent).toBe(
      "Deactivated",
    );
    expect(screen.getByText("Omar")).toBeTruthy();
    // Role + scope summaries are shown on each row.
    expect(screen.getAllByText("Roles").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scopes").length).toBeGreaterThan(0);
  });

  it("shows an empty state (not an error) when there are zero staff", async () => {
    const adapter = fakeStaffAdapter({ listStaff: async () => page([]) });
    render(
      <StaffListScreen
        adapter={adapter}
        canManage
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByText(/No staff yet/)).toBeTruthy();
  });

  it("submits search + status as a server query (never a client-side filter)", async () => {
    const listStaff = vi.fn().mockResolvedValue(page([staffSummary()]));
    const adapter = fakeStaffAdapter({ listStaff });
    render(
      <StaffListScreen
        adapter={adapter}
        canManage
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    await screen.findByText("Layla Hassan");
    expect(listStaff).toHaveBeenLastCalledWith({});

    fireEvent.change(screen.getByTestId("staff-search-term"), { target: { value: "layla" } });
    fireEvent.click(screen.getByTestId("staff-status-filter-suspended"));
    fireEvent.click(screen.getByTestId("staff-search-submit"));

    await waitFor(() =>
      expect(listStaff).toHaveBeenLastCalledWith({ search: "layla", status: "suspended" }),
    );
  });

  it("offers an optional role filter only when role options are supplied", async () => {
    const listStaff = vi.fn().mockResolvedValue(page([staffSummary()]));
    const adapter = fakeStaffAdapter({ listStaff });
    render(
      <StaffListScreen
        adapter={adapter}
        canManage
        roleOptions={[roleOption({ id: ROLE_MANAGER, label: "Branch Manager" })]}
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    await screen.findByText("Layla Hassan");
    fireEvent.click(screen.getByTestId(`staff-role-filter-${ROLE_MANAGER}`));
    fireEvent.click(screen.getByTestId("staff-search-submit"));
    await waitFor(() => expect(listStaff).toHaveBeenLastCalledWith({ roleId: ROLE_MANAGER }));
  });

  it("shows the Add-Staff affordance only when the caller can manage staff (read-only otherwise)", async () => {
    const adapter = fakeStaffAdapter({
      listStaff: async () => page([staffSummary({ membershipId: MEMBERSHIP_STAFF_A })]),
    });
    const { rerender } = render(
      <StaffListScreen
        adapter={adapter}
        canManage
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByTestId("add-staff")).toBeTruthy();
    expect(screen.queryByTestId("staff-read-only-note")).toBeNull();

    rerender(
      <StaffListScreen
        adapter={adapter}
        canManage={false}
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    await screen.findByTestId(`staff-row-${MEMBERSHIP_STAFF_A}`);
    expect(screen.queryByTestId("add-staff")).toBeNull();
    expect(screen.getByTestId("staff-read-only-note")).toBeTruthy();
  });

  it("surfaces a classified network error with a retry", async () => {
    const listStaff = vi
      .fn()
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(page([staffSummary()]));
    const adapter = fakeStaffAdapter({ listStaff });
    render(
      <StaffListScreen
        adapter={adapter}
        canManage
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    fireEvent.click(await screen.findByText("Try again"));
    expect(await screen.findByText("Layla Hassan")).toBeTruthy();
  });

  it("does NOT turn a 403 into an empty list — it shows access denied without retry", async () => {
    const adapter = fakeStaffAdapter({
      listStaff: async () => {
        throw new ApiHttpError("no", 403, "FORBIDDEN", null);
      },
    });
    render(
      <StaffListScreen
        adapter={adapter}
        canManage
        onOpenStaff={noop}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText(/No staff/)).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("navigates by real membership id when a row is tapped", async () => {
    const onOpenStaff = vi.fn();
    const adapter = fakeStaffAdapter({
      listStaff: async () => page([staffSummary({ membershipId: MEMBERSHIP_STAFF_A })]),
    });
    render(
      <StaffListScreen
        adapter={adapter}
        canManage
        onOpenStaff={onOpenStaff}
        onAddStaff={noop}
        onBack={noop}
      />,
    );
    fireEvent.click(await screen.findByTestId(`staff-row-${MEMBERSHIP_STAFF_A}`));
    expect(onOpenStaff).toHaveBeenCalledWith(MEMBERSHIP_STAFF_A);
  });
});
