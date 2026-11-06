// @vitest-environment jsdom
import type {
  AdjustmentListResponse,
  LeaveListResponse,
  PayrollReportResponse,
  PayrollSettings,
} from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { PayrollScreen } from "./PayrollScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  getPayrollReport: vi.fn(),
  listAdjustments: vi.fn(),
  createAdjustment: vi.fn(),
  removeAdjustment: vi.fn(),
  listLeaves: vi.fn(),
  getPayrollSettings: vi.fn(),
  updatePayrollSettings: vi.fn(),
  setCompensation: vi.fn(),
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
      getPayrollReport: mocks.getPayrollReport,
      listAdjustments: mocks.listAdjustments,
      createAdjustment: mocks.createAdjustment,
      removeAdjustment: mocks.removeAdjustment,
      listLeaves: mocks.listLeaves,
      getPayrollSettings: mocks.getPayrollSettings,
      updatePayrollSettings: mocks.updatePayrollSettings,
      setCompensation: mocks.setCompensation,
    }),
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onBack = vi.fn();

function payrollReport(): PayrollReportResponse {
  return {
    items: [
      {
        membershipId: MEMBERSHIP_A,
        memberDisplayName: "Mona Adel",
        memberEmail: null,
        workedMinutes: 2400,
        workedHours: 40,
        workedDays: 5,
        normalHours: 40,
        overtimeHours: 0,
        baseSalaryMinor: 200000,
        overtimeRateMinor: 0,
        overtimeAmountMinor: 0,
        bonusMinor: 5000,
        deductionMinor: 0,
        netPayMinor: 205000,
        currency: "USD",
      },
    ],
    totals: {
      baseSalaryMinor: 200000,
      overtimeAmountMinor: 0,
      bonusMinor: 5000,
      deductionMinor: 0,
      netPayMinor: 205000,
    },
  };
}

function adjustments(): AdjustmentListResponse {
  return { items: [] };
}
function leaves(): LeaveListResponse {
  return { items: [] };
}
function settings(): PayrollSettings {
  return { normalHours: 40, shiftDurationHours: 8 };
}

function Harness({ context = meContext(TENANT_A) }: { context?: ReturnType<typeof meContext> }) {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return <PayrollScreen tenantId={state.tenantId} context={context} onBack={onBack} />;
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
  mocks.getPayrollReport.mockResolvedValue(payrollReport());
  mocks.listAdjustments.mockResolvedValue(adjustments());
  mocks.createAdjustment.mockResolvedValue({
    id: "adj1",
    membershipId: MEMBERSHIP_A,
    memberDisplayName: "Mona Adel",
    type: "bonus",
    amountMinor: 5000,
    reason: null,
    effectiveDate: "2026-10-01",
    hours: null,
    createdAt: "2026-10-01T00:00:00.000Z",
  });
  mocks.listLeaves.mockResolvedValue(leaves());
  mocks.getPayrollSettings.mockResolvedValue(settings());
  mocks.updatePayrollSettings.mockResolvedValue(settings());
});

afterEach(() => cleanup());

describe("PayrollScreen", () => {
  it("renders the computed payroll report and totals", async () => {
    renderScreen();
    expect(await screen.findByTestId("payroll-report")).toBeTruthy();
    expect(screen.getByTestId(`payroll-row-${MEMBERSHIP_A}`)).toBeTruthy();
    expect(screen.getByTestId("payroll-totals")).toBeTruthy();
  });

  it("creates a bonus adjustment", async () => {
    renderScreen();
    fireEvent.change(await screen.findByTestId("payroll-adj-membership"), {
      target: { value: MEMBERSHIP_A },
    });
    fireEvent.change(screen.getByTestId("payroll-adj-amount"), { target: { value: "50" } });
    fireEvent.click(screen.getByTestId("payroll-adj-submit"));
    await waitFor(() => expect(mocks.createAdjustment).toHaveBeenCalledTimes(1));
    expect(mocks.createAdjustment).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_A,
      type: "bonus",
      amountMinor: 5000,
    });
  });

  it("saves payroll settings seeded from the server", async () => {
    renderScreen();
    const normal = await screen.findByTestId("payroll-normal-hours");
    expect((normal as HTMLInputElement).value).toBe("40");
    fireEvent.change(normal, { target: { value: "45" } });
    fireEvent.click(screen.getByTestId("payroll-settings-submit"));
    await waitFor(() => expect(mocks.updatePayrollSettings).toHaveBeenCalledTimes(1));
    expect(mocks.updatePayrollSettings).toHaveBeenCalledWith({
      normalHours: 45,
      shiftDurationHours: 8,
    });
  });

  it("sets compensation for a member", async () => {
    renderScreen();
    fireEvent.change(await screen.findByTestId("payroll-comp-membership"), {
      target: { value: MEMBERSHIP_A },
    });
    fireEvent.change(screen.getByTestId("payroll-comp-base"), { target: { value: "2000" } });
    fireEvent.change(screen.getByTestId("payroll-comp-ot"), { target: { value: "15" } });
    fireEvent.change(screen.getByTestId("payroll-comp-hours"), { target: { value: "40" } });
    // Currency is locked to the single operating currency (EGP) and shown read-only.
    expect(screen.getByTestId("payroll-comp-currency").textContent).toContain("EGP");
    fireEvent.click(screen.getByTestId("payroll-comp-submit"));
    await waitFor(() => expect(mocks.setCompensation).toHaveBeenCalledTimes(1));
    expect(mocks.setCompensation).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_A,
      baseSalaryMinor: 200000,
      overtimeRateMinor: 1500,
      normalHours: 40,
      currency: "EGP",
    });
  });

  it("gates reads behind the staff capability", async () => {
    renderScreen(meContext(TENANT_A, { staff: null }));
    expect(await screen.findByText("Attendance access required")).toBeTruthy();
  });
});
