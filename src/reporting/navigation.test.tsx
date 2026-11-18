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
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mocks.push }),
  Redirect: () => null,
}));
vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => ({ tenantId, getContext: mocks.getContext }),
  }),
}));
vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import MoreRoute from "../../app/more";
import { SessionProvider } from "../session/SessionProvider";

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
});
afterEach(() => cleanup());

describe("Reporting navigation", () => {
  it("is hidden when reports guidance is missing", async () => {
    mocks.getContext.mockResolvedValue(meContext(TENANT_A));
    renderMore();
    // `open-more` always renders; `open-products` is a PRIMARY bottom-tab, not a More row.
    await screen.findByTestId("more-account");
    expect(screen.queryByTestId("section-reports")).toBeNull();
  });

  it("is shown for explicit read guidance and opens /reports", async () => {
    const context = meContext(TENANT_A);
    mocks.getContext.mockResolvedValue({
      ...context,
      access: { ...context.access, reports: { canRead: true } },
    });
    renderMore();
    fireEvent.click(await screen.findByTestId("section-reports"));
    expect(mocks.push).toHaveBeenCalledWith("/reports");
    // Products and Orders are PRIMARY bottom-tabs; Promotions remains a secondary More row.
    expect(screen.getByTestId("section-promotions")).toBeTruthy();
  });
});
