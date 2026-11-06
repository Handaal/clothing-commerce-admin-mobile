// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  signOut: vi.fn(async () => {}),
  push: vi.fn(),
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
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => ({ tenantId, getContext: mocks.getContext }),
  }),
}));
vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import HomeScreen from "../../app/index";
import { SessionProvider } from "../session/SessionProvider";

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
});
afterEach(() => cleanup());

describe("Promotion navigation", () => {
  it("hides navigation when Promotion read guidance is absent", async () => {
    mocks.getContext.mockResolvedValue(meContext(TENANT_A, { promotions: null }));
    renderHome();
    // `open-more` is always present on the dashboard; `open-products` is a PRIMARY bottom-tab and is
    // deliberately not a dashboard module card.
    await screen.findByTestId("open-more");
    expect(screen.queryByTestId("open-promotions")).toBeNull();
  });

  it("shows navigation for read-only access and opens the Promotions route", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, { promotions: { canRead: true, canManage: false } }),
    );
    renderHome();
    fireEvent.click(await screen.findByTestId("open-promotions"));
    expect(mocks.push).toHaveBeenCalledWith("/promotions");
  });

  it("keeps existing Admin modules available", async () => {
    mocks.getContext.mockResolvedValue(meContext(TENANT_A));
    renderHome();
    await screen.findByTestId("open-promotions");
    // Products and Orders are PRIMARY bottom-tabs, not dashboard module cards; the remaining
    // secondary management areas still surface as cards.
    expect(screen.getByTestId("open-suppliers")).toBeTruthy();
    expect(screen.getByTestId("open-staff")).toBeTruthy();
  });
});
