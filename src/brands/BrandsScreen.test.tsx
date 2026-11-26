// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { BrandsScreen } from "./BrandsScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listVendors: vi.fn(),
  createVendor: vi.fn(),
  updateVendor: vi.fn(),
  setVendorStatus: vi.fn(),
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

const ZARA = "d1000000-0000-4000-8000-000000000001";
let keySeq = 0;

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <BrandsScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => {}}
      generateIdempotencyKey={() => `key-${++keySeq}`}
    />
  );
}

function renderScreen() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  keySeq = 0;
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
  mocks.listVendors.mockResolvedValue({
    vendors: [
      { id: ZARA, name: "Zara", slug: "zara", position: 0, status: "active", productCount: 4 },
    ],
  });
});

afterEach(() => cleanup());

describe("BrandsScreen", () => {
  it("lists brands and adds one with a web address from its name", async () => {
    mocks.createVendor.mockResolvedValue({ vendorId: "new", status: "active" });
    renderScreen();
    expect(await screen.findByTestId("brand-row-zara")).toBeTruthy();
    fireEvent.change(screen.getByTestId("brand-new-name"), {
      target: { value: "Armani Exchange" },
    });
    fireEvent.click(screen.getByTestId("brand-new-submit"));
    await waitFor(() =>
      expect(mocks.createVendor).toHaveBeenCalledWith({
        name: "Armani Exchange",
        slug: "armani-exchange",
        idempotencyKey: "key-1",
      }),
    );
  });

  it("archives a brand", async () => {
    mocks.setVendorStatus.mockResolvedValue({ vendorId: ZARA, status: "archived" });
    renderScreen();
    fireEvent.click(await screen.findByTestId("brand-edit-zara"));
    fireEvent.click(screen.getByTestId("brand-archive-zara"));
    await waitFor(() =>
      expect(mocks.setVendorStatus).toHaveBeenCalledWith({
        vendorId: ZARA,
        status: "archived",
        idempotencyKey: "key-1",
      }),
    );
  });

  it("shows an empty state when there are no brands", async () => {
    mocks.listVendors.mockResolvedValue({ vendors: [] });
    renderScreen();
    expect(await screen.findByTestId("brand-empty")).toBeTruthy();
  });
});
