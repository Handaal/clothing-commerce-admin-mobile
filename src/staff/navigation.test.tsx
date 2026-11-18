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
  Redirect: () => null,
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
import MoreRoute from "../../app/more";

function renderMore() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <MoreRoute />
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
    renderMore();
    const button = await screen.findByTestId("section-staff");
    expect(button).toBeTruthy();
    fireEvent.click(button);
    expect(mocks.push).toHaveBeenCalledWith("/staff");
  });

  it("keeps primary bottom-tab destinations out while retaining secondary management areas", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, { inventory: { canRead: true, tenantWide: true, locations: [] } }),
    );
    renderMore();
    await screen.findByTestId("section-staff");
    expect(screen.queryByTestId("section-products")).toBeNull();
    expect(screen.queryByTestId("section-inventory")).toBeNull();
    expect(screen.queryByTestId("section-orders")).toBeNull();
    expect(screen.getByTestId("section-suppliers")).toBeTruthy();
  });

  it("hides the Staff entry when the context grants no staff read access", async () => {
    // Staff capability absent entirely (older server / no access): navigation is not offered, and the
    // final context DTO not being frozen never breaks the ready screen.
    mocks.getContext.mockResolvedValue(meContext(TENANT_A, { staff: null }));
    renderMore();
    await screen.findByTestId("section-suppliers");
    expect(screen.queryByTestId("section-staff")).toBeNull();
  });
});
