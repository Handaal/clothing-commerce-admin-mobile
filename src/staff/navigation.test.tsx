// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  withTenant: vi.fn(),
  signOut: vi.fn(async () => {}),
  push: vi.fn(),
  back: vi.fn(),
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

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}));

vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => {
      mocks.withTenant(tenantId);
      return { tenantId, getContext: mocks.getContext };
    },
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import { SessionProvider } from "../session/SessionProvider";
import HomeScreen from "../../app/index";

function renderHome() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <HomeScreen />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
});

afterEach(() => cleanup());

describe("management navigation — Staff entry", () => {
  it("offers a Staff entry that navigates to /staff when staff read is granted", async () => {
    renderHome();
    const button = await screen.findByTestId("open-staff");
    expect(button).toBeTruthy();
    fireEvent.click(button);
    expect(mocks.push).toHaveBeenCalledWith("/staff");
  });

  it("keeps primary bottom-tab destinations out while retaining secondary management areas", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, { inventory: { canRead: true, tenantWide: true, locations: [] } }),
    );
    renderHome();
    await screen.findByTestId("open-staff");
    expect(screen.queryByTestId("open-products")).toBeNull();
    expect(screen.queryByTestId("open-inventory")).toBeNull();
    expect(screen.queryByTestId("open-orders")).toBeNull();
    expect(screen.getByTestId("open-suppliers")).toBeTruthy();
  });

  it("hides the Staff entry when the context grants no staff read access", async () => {
    // Staff capability absent entirely (older server / no access): navigation is not offered, and the
    // final context DTO not being frozen never breaks the ready screen.
    mocks.getContext.mockResolvedValue(meContext(TENANT_A, { staff: null }));
    renderHome();
    await screen.findByTestId("open-suppliers");
    expect(screen.queryByTestId("open-staff")).toBeNull();
  });
});
