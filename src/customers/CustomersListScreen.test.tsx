// @vitest-environment jsdom
import type { CustomerListResponse } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { CustomersListScreen } from "./CustomersListScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listCustomers: vi.fn(),
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
      listCustomers: mocks.listCustomers,
    }),
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onOpenCustomer = vi.fn();
const onBack = vi.fn();

const CUSTOMER_A = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";

function customerList(overrides = {}): CustomerListResponse {
  return {
    items: [
      {
        id: CUSTOMER_A,
        name: "Mona Adel",
        phone: "+20 10 1234 5678",
        email: "mona@example.com",
        createdAt: "2026-09-01T10:00:00.000Z",
        orderCount: 4,
        totalSpentMinor: 120000,
        lastOrderAt: "2026-09-20T10:00:00.000Z",
        currency: "USD",
      },
    ],
    pageInfo: { nextCursor: null, hasMore: false },
    ...overrides,
  };
}

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return <CustomersListScreen tenantId={state.tenantId} onOpenCustomer={onOpenCustomer} onBack={onBack} />;
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
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
  mocks.listCustomers.mockResolvedValue(customerList());
});

afterEach(() => cleanup());

describe("CustomersListScreen", () => {
  it("lists customers with order count and lifetime spend", async () => {
    renderScreen();
    expect(await screen.findByTestId(`customer-row-${CUSTOMER_A}`)).toBeTruthy();
    expect(screen.getByText("Mona Adel")).toBeTruthy();
    expect(screen.getByText("USD 1200.00")).toBeTruthy();
  });

  it("opens a customer on press", async () => {
    renderScreen();
    fireEvent.click(await screen.findByTestId(`customer-row-${CUSTOMER_A}`));
    expect(onOpenCustomer).toHaveBeenCalledWith(CUSTOMER_A);
  });

  it("runs a server-backed search", async () => {
    renderScreen();
    await screen.findByTestId(`customer-row-${CUSTOMER_A}`);
    fireEvent.change(screen.getByTestId("customer-search-term"), { target: { value: "mona" } });
    fireEvent.click(screen.getByTestId("customer-search-submit"));
    await waitFor(() => expect(mocks.listCustomers).toHaveBeenCalledWith({ search: "mona" }));
  });

  it("shows an empty state when there are no customers", async () => {
    mocks.listCustomers.mockResolvedValue(customerList({ items: [] }));
    renderScreen();
    expect(await screen.findByTestId("customer-empty")).toBeTruthy();
  });
});
