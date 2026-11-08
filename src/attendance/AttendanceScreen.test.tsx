// @vitest-environment jsdom
import type {
  AttendanceClockResponse,
  AttendanceListResponse,
  MyAttendanceResponse,
} from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { AttendanceScreen } from "./AttendanceScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  getMyAttendance: vi.fn(),
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  startLeave: vi.fn(),
  endLeave: vi.fn(),
  listAttendance: vi.fn(),
  addAttendanceEntry: vi.fn(),
  updateAttendanceEntry: vi.fn(),
  removeAttendanceEntry: vi.fn(),
  signOut: vi.fn(async () => {}),
}));

vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_1",
    sessionId: "sess_1",
    getToken: () => Promise.resolve("test-token"),
    signOut: mocks.signOut,
  }),
}));

vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => ({
      tenantId,
      getContext: mocks.getContext,
      getMyAttendance: mocks.getMyAttendance,
      clockIn: mocks.clockIn,
      clockOut: mocks.clockOut,
      startLeave: mocks.startLeave,
      endLeave: mocks.endLeave,
      listAttendance: mocks.listAttendance,
      addAttendanceEntry: mocks.addAttendanceEntry,
      updateAttendanceEntry: mocks.updateAttendanceEntry,
      removeAttendanceEntry: mocks.removeAttendanceEntry,
    }),
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onBack = vi.fn();
const onOpenPayroll = vi.fn();
const ENTRY_A = "aa11aa11-aa11-4a11-8a11-aa11aa11aa11";

function entry(open: boolean): AttendanceClockResponse["entry"] {
  return {
    id: ENTRY_A,
    membershipId: MEMBERSHIP_A,
    memberDisplayName: "Mona Adel",
    memberEmail: null,
    branchId: null,
    branchName: null,
    clockIn: "2026-10-01T09:00:00.000Z",
    clockOut: open ? null : "2026-10-01T17:00:00.000Z",
    workedMinutes: open ? null : 480,
    createdAt: "2026-10-01T09:00:00.000Z",
    updatedAt: "2026-10-01T09:00:00.000Z",
  };
}

function myAttendance(open: boolean): MyAttendanceResponse {
  return { openEntry: open ? entry(true) : null, entries: [entry(false)] };
}

function attendanceList(): AttendanceListResponse {
  return { items: [entry(true)], pageInfo: { nextCursor: null, hasMore: false } };
}

function Harness({ context = meContext(TENANT_A) }: { context?: ReturnType<typeof meContext> }) {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <AttendanceScreen
      tenantId={state.tenantId}
      context={context}
      onBack={onBack}
      onOpenPayroll={onOpenPayroll}
    />
  );
}

function renderScreen(context?: ReturnType<typeof meContext>) {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness context={context} />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
  mocks.getMyAttendance.mockResolvedValue(myAttendance(false));
  mocks.clockIn.mockResolvedValue({ entry: entry(true) });
  mocks.clockOut.mockResolvedValue({ entry: entry(false) });
  mocks.listAttendance.mockResolvedValue(attendanceList());
  mocks.addAttendanceEntry.mockResolvedValue({ entry: entry(false) });
  mocks.removeAttendanceEntry.mockResolvedValue({ id: ENTRY_A });
});

afterEach(() => cleanup());

describe("AttendanceScreen", () => {
  it("clocks in when the member has no open entry", async () => {
    renderScreen();
    fireEvent.click(await screen.findByTestId("attendance-clock-in"));
    await waitFor(() => expect(mocks.clockIn).toHaveBeenCalledTimes(1));
  });

  it("clocks out when the member has an open entry", async () => {
    mocks.getMyAttendance.mockResolvedValue(myAttendance(true));
    renderScreen();
    fireEvent.click(await screen.findByTestId("attendance-clock-out"));
    await waitFor(() => expect(mocks.clockOut).toHaveBeenCalledTimes(1));
  });

  it("adds a manual attendance entry for a manager", async () => {
    renderScreen();
    fireEvent.change(await screen.findByTestId("attendance-entry-membership"), {
      target: { value: MEMBERSHIP_A },
    });
    fireEvent.change(screen.getByTestId("attendance-entry-clockin"), {
      target: { value: "2026-10-01T09:00:00Z" },
    });
    fireEvent.click(screen.getByTestId("attendance-entry-submit"));
    await waitFor(() => expect(mocks.addAttendanceEntry).toHaveBeenCalledTimes(1));
    expect(mocks.addAttendanceEntry).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_A,
      clockIn: "2026-10-01T09:00:00Z",
    });
  });

  it("hides manager controls when the caller cannot manage staff", async () => {
    renderScreen(meContext(TENANT_A, { staff: { canRead: true, canManage: false } }));
    await screen.findByTestId("attendance-my");
    expect(screen.queryByTestId("attendance-add-entry-form")).toBeNull();
  });

  it("shows the access notice without read capability", async () => {
    renderScreen(meContext(TENANT_A, { staff: null }));
    expect(await screen.findByText("Attendance access required")).toBeTruthy();
  });
});
