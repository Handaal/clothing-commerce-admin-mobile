// @vitest-environment jsdom
import type {
  CustomerDetailResponse,
  CustomerOrdersResponse,
} from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BRAND_A,
  MEMBERSHIP_A,
  ORDER_A,
  TENANT_A,
  meContext,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { CustomerDetailScreen } from "./CustomerDetailScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  getCustomer: vi.fn(),
  listCustomerOrders: vi.fn(),
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
      getCustomer: mocks.getCustomer,
      listCustomerOrders: mocks.listCustomerOrders,
    }),
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onBack = vi.fn();
const onOpenOrder = vi.fn();
const CUSTOMER_A = "c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1";

function customerDetail(overrides = {}): CustomerDetailResponse {
  return {
    id: CUSTOMER_A,
    name: "Mona Adel",
    phone: "+20 10 1234 5678",
    email: "mona@example.com",
    createdAt: "2026-09-01T10:00:00.000Z",
    orderCount: 2,
    totalSpentMinor: 50000,
    lastOrderAt: "2026-09-20T10:00:00.000Z",
    currency: "USD",
    outstandingMinor: 0,
    ...overrides,
  };
}

function customerOrders(items: CustomerOrdersResponse["items"] = []): CustomerOrdersResponse {
  return { items, pageInfo: { nextCursor: null, hasMore: false } };
}

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <CustomerDetailScreen
      tenantId={state.tenantId}
      customerId={CUSTOMER_A}
      onBack={onBack}
      onOpenOrder={onOpenOrder}
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
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
  mocks.getCustomer.mockResolvedValue(customerDetail());
  mocks.listCustomerOrders.mockResolvedValue(
    customerOrders([
      {
        id: ORDER_A,
        orderNumber: "ORD-1001",
        channel: "pos",
        status: "placed",
        brandId: BRAND_A,
        branchId: null,
        currency: "USD",
        totalMinor: 25000,
        placedAt: "2026-09-20T10:00:00.000Z",
      },
    ]),
  );
});

afterEach(() => cleanup());

describe("CustomerDetailScreen", () => {
  it("renders the customer profile and lifetime spend", async () => {
    renderScreen();
    expect(await screen.findByTestId("customer-total-spent")).toBeTruthy();
    expect(screen.getByText("Mona Adel")).toBeTruthy();
    expect(screen.getByText("+20 10 1234 5678")).toBeTruthy();
  });

  it("lists the customer's orders and opens one on press", async () => {
    renderScreen();
    fireEvent.click(await screen.findByTestId(`customer-order-${ORDER_A}`));
    expect(onOpenOrder).toHaveBeenCalledWith(ORDER_A);
  });

  it("shows an empty state when the customer has no orders", async () => {
    mocks.listCustomerOrders.mockResolvedValue(customerOrders([]));
    renderScreen();
    expect(await screen.findByText("No orders")).toBeTruthy();
  });
});
