// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { SubscribersScreen, subscribersAsText } from "./SubscribersScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listSubscribers: vi.fn(),
}));

vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_1",
    sessionId: "sess_1",
    getToken: () => Promise.resolve("test-token"),
    signOut: vi.fn(),
  }),
}));
vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => ({ tenantId, ...mocks }),
  }),
}));
vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "mock-uuid" }));

import { SessionProvider, useSession } from "../session/SessionProvider";

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return <SubscribersScreen tenantId={state.tenantId} context={state.context} onBack={() => {}} />;
}

function renderScreen() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness />
    </SessionProvider>,
  );
}

const LIST = {
  subscribers: [
    {
      id: "a1000000-0000-4000-8000-000000000001",
      email: "fan@example.com",
      brandId: null,
      source: "home",
      createdAt: "2026-11-19T10:00:00.000Z",
    },
  ],
  total: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
});

afterEach(() => cleanup());

describe("SubscribersScreen", () => {
  it("shows the total, the latest sign-ups and a share button", async () => {
    mocks.listSubscribers.mockResolvedValue(LIST);
    renderScreen();
    expect((await screen.findByTestId("subs-total")).textContent).toBe("3");
    expect(screen.getByText("fan@example.com")).toBeTruthy();
    expect(screen.getByText("Showing the latest 1")).toBeTruthy();
    expect(screen.getByTestId("subs-share")).toBeTruthy();
    expect(mocks.listSubscribers).toHaveBeenCalledWith({ limit: 1000 });
  });

  it("explains an empty list", async () => {
    mocks.listSubscribers.mockResolvedValue({ subscribers: [], total: 0 });
    renderScreen();
    expect(await screen.findByTestId("subs-empty")).toBeTruthy();
  });

  it("formats the list one email per line", () => {
    expect(
      subscribersAsText({
        subscribers: [LIST.subscribers[0]!, { ...LIST.subscribers[0]!, email: "b@x.co" }],
        total: 2,
      }),
    ).toBe("fan@example.com\nb@x.co");
  });
});
