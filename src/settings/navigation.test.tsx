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
    getToken: () => Promise.resolve("token"),
    signOut: mocks.signOut,
  }),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: () => ({ getContext: mocks.getContext }),
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

describe("Settings navigation", () => {
  it("is hidden when Settings read guidance is missing", async () => {
    mocks.getContext.mockResolvedValue(meContext(TENANT_A));
    renderHome();
    await screen.findByTestId("open-products");
    expect(screen.queryByTestId("open-settings")).toBeNull();
  });
  it("is shown for explicit read guidance and opens /settings", async () => {
    const context = meContext(TENANT_A);
    mocks.getContext.mockResolvedValue({
      ...context,
      access: { ...context.access, settings: { canRead: true, canManage: false } },
    });
    renderHome();
    fireEvent.click(await screen.findByTestId("open-settings"));
    expect(mocks.push).toHaveBeenCalledWith("/settings");
    expect(screen.getByText("Read", { selector: "div" })).toBeTruthy();
  });
});
