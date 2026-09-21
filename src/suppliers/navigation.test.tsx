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

// The home screen navigates via expo-router; assert the real route it pushes.
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

describe("management navigation — Suppliers entry", () => {
  it("offers a Suppliers entry that navigates to /suppliers", async () => {
    renderHome();
    const button = await screen.findByTestId("open-suppliers");
    expect(button).toBeTruthy();
    fireEvent.click(button);
    expect(mocks.push).toHaveBeenCalledWith("/suppliers");
  });

  it("does not disturb the existing catalog / inventory / orders entries", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, { inventory: { canRead: true, tenantWide: true, locations: [] } }),
    );
    renderHome();
    await screen.findByTestId("open-suppliers");
    expect(screen.getByTestId("open-products")).toBeTruthy();
    expect(screen.getByTestId("open-inventory")).toBeTruthy();
    expect(screen.getByTestId("open-orders")).toBeTruthy();
  });

  it("hides the Suppliers entry when the context grants no supplier read access", async () => {
    // Suppliers capability absent entirely (older server / no access): navigation is not offered.
    mocks.getContext.mockResolvedValue(meContext(TENANT_A, { suppliers: null }));
    renderHome();
    // Wait for a known entry to confirm the ready screen rendered, then assert Suppliers is absent.
    await screen.findByTestId("open-products");
    expect(screen.queryByTestId("open-suppliers")).toBeNull();
  });
});
