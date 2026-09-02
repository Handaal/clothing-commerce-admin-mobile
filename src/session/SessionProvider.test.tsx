// @vitest-environment jsdom
import type { MeTenantsResponse } from "@shifted/clothing-commerce-sdk";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MEMBERSHIP_A,
  MEMBERSHIP_B,
  TENANT_A,
  TENANT_B,
  meContext,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage, type TenantStorage } from "../tenant/storage";

// Shared, hoisted test doubles. `vi.mock` factories run before the module body, so the spies they
// close over must be created inside `vi.hoisted`.
const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  constructClient: vi.fn(),
  signOut: vi.fn(async () => {}),
  // Mutable Clerk snapshot the mocked `useAuth` reads from each render.
  auth: {
    current: {
      isLoaded: true,
      isSignedIn: true,
      userId: "user_1" as string | null,
      sessionId: "sess_1" as string | null,
    },
  },
  // Counts how many distinct `getToken` identities `useAuth` has handed out.
  getTokenIdentities: { count: 0 },
}));

// Reproduce the real defect: @clerk/expo's `useAuth` returns a BRAND-NEW `getToken` every render.
vi.mock("@clerk/expo", () => ({
  useAuth: () => {
    mocks.getTokenIdentities.count += 1;
    const getToken = () => Promise.resolve("test-token");
    return { ...mocks.auth.current, getToken, signOut: mocks.signOut };
  },
}));

// The Commerce client factory returns a fresh object each call (so we can count constructions) but
// backs it with shared spies (so we can count bootstrap calls regardless of client identity).
vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: (opts: unknown) => {
    mocks.constructClient(opts);
    return {
      getMyTenants: mocks.getMyTenants,
      withTenant: () => ({ getContext: mocks.getContext }),
    };
  },
}));

// The default (device) storage pulls in expo-secure-store → react-native (Flow), which the test
// bundler cannot parse. Tests always inject storage, so stub this factory to keep it out of the graph.
vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => {
    let value: string | null = null;
    return {
      readSelectedTenantId: async () => value,
      writeSelectedTenantId: async (id: string) => {
        value = id;
      },
      clearSelectedTenantId: async () => {
        value = null;
      },
    };
  },
}));

// Imported after the mocks are registered.
import { SessionProvider, useSession } from "./SessionProvider";

function Probe() {
  const { state } = useSession();
  const count =
    state.phase === "choosing" || state.phase === "loading-context" || state.phase === "ready"
      ? `:${state.tenants.length}`
      : "";
  return <span data-testid="phase">{`${state.phase}${count}`}</span>;
}

function renderProvider(storage: TenantStorage) {
  // A fresh element every time: passing the identical element reference makes React bail out of
  // re-rendering, which would hide auth-change driven effects.
  const element = () => (
    <SessionProvider storage={storage}>
      <Probe />
    </SessionProvider>
  );
  const result = render(element());
  const rerender = () => result.rerender(element());
  return { ...result, rerender };
}

const phase = () => screen.getByTestId("phase").textContent;
const flush = () => act(async () => {});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTokenIdentities.count = 0;
  mocks.auth.current = { isLoaded: true, isSignedIn: true, userId: "user_1", sessionId: "sess_1" };
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
});

afterEach(() => cleanup());

describe("SessionProvider authenticated bootstrap stability", () => {
  it("bootstraps tenants exactly once on an authenticated render (no update loop)", async () => {
    renderProvider(createMemoryTenantStorage());

    await waitFor(() => expect(phase()).toBe("ready:1"));

    // One bootstrap and one client even though several dispatch-driven re-renders occurred and each
    // one handed out a new `getToken` identity — the loop trigger is gone.
    expect(mocks.getMyTenants).toHaveBeenCalledTimes(1);
    expect(mocks.constructClient).toHaveBeenCalledTimes(1);
    expect(mocks.getTokenIdentities.count).toBeGreaterThan(1);
  });

  it("the bootstrap-start dispatch alone does not retrigger the effect", async () => {
    // Never-resolving bootstrap keeps state at `bootstrapping` after its own dispatch.
    mocks.getMyTenants.mockReturnValue(new Promise<MeTenantsResponse>(() => {}));

    renderProvider(createMemoryTenantStorage());
    await waitFor(() => expect(phase()).toBe("bootstrapping"));

    await flush();
    await flush();

    expect(mocks.getMyTenants).toHaveBeenCalledTimes(1);
  });

  it("a bootstrap failure settles into one stable error state and never auto-retries", async () => {
    mocks.getMyTenants.mockRejectedValue(new Error("boom"));

    renderProvider(createMemoryTenantStorage());
    await waitFor(() => expect(phase()).toBe("error"));

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    expect(phase()).toBe("error");
    expect(mocks.getMyTenants).toHaveBeenCalledTimes(1);
  });

  it("re-rendering with unchanged auth/session does not bootstrap again", async () => {
    const storage = createMemoryTenantStorage();
    const { rerender } = renderProvider(storage);
    await waitFor(() => expect(phase()).toBe("ready:1"));

    rerender();
    rerender();
    await flush();

    expect(mocks.getMyTenants).toHaveBeenCalledTimes(1);
    expect(mocks.constructClient).toHaveBeenCalledTimes(1);
  });

  it("a session-identity change triggers a fresh bootstrap (client stays stable)", async () => {
    const storage = createMemoryTenantStorage();
    const { rerender } = renderProvider(storage);
    await waitFor(() => expect(phase()).toBe("ready:1"));
    expect(mocks.getMyTenants).toHaveBeenCalledTimes(1);

    mocks.auth.current = { ...mocks.auth.current, sessionId: "sess_2" };
    rerender();

    await waitFor(() => expect(mocks.getMyTenants).toHaveBeenCalledTimes(2));
    // The client is reused across sessions — token freshness comes from the ref, not a rebuild.
    expect(mocks.constructClient).toHaveBeenCalledTimes(1);
  });

  it("signing out (auth flips to signed-out) resets session state", async () => {
    const storage = createMemoryTenantStorage();
    const { rerender } = renderProvider(storage);
    await waitFor(() => expect(phase()).toBe("ready:1"));

    mocks.auth.current = { isLoaded: true, isSignedIn: false, userId: null, sessionId: null };
    rerender();

    await waitFor(() => expect(phase()).toBe("signed-out"));
  });

  it("keeps zero / one / multiple tenant resolution intact", async () => {
    // Zero tenants → explicit no-access.
    mocks.getMyTenants.mockResolvedValue([]);
    const zero = renderProvider(createMemoryTenantStorage());
    await waitFor(() => expect(phase()).toBe("no-access"));
    zero.unmount();

    // Exactly one tenant → auto-selected → context loaded → ready.
    mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
    const one = renderProvider(createMemoryTenantStorage());
    await waitFor(() => expect(phase()).toBe("ready:1"));
    one.unmount();

    // Multiple tenants, no persisted choice → selection required.
    mocks.getMyTenants.mockResolvedValue([
      tenant(TENANT_A, "Acme", MEMBERSHIP_A),
      tenant(TENANT_B, "Beta", MEMBERSHIP_B),
    ]);
    renderProvider(createMemoryTenantStorage());
    await waitFor(() => expect(phase()).toBe("choosing:2"));
  });
});
