import { createCommerceClient, type OrderDetailResponse } from "@shifted/clothing-commerce-sdk";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { OrderDetailScreen } from "../src/orders/OrderDetailScreen";
import { OrdersListScreen } from "../src/orders/OrdersListScreen";
import { loadAllOrders } from "../src/orders/load";
import { SessionProvider, useSession } from "../src/session/SessionProvider";
import { createMemoryTenantStorage } from "../src/tenant/storage";

// Only the device's auth/storage adapters are replaced. All bootstrap, SDK, HTTP, authorization,
// checkout, list and detail requests use the real API and its disposable checkout fixture.
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "runtime-user",
    sessionId: "runtime-session",
    getToken: async () => process.env.ONLINE_TEST_TOKEN,
    signOut: async () => {},
  }),
}));
vi.mock("../src/tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

const tenantId = "2a000001-0000-4000-8000-000000000001";
const brandId = "2a000002-0000-4000-8000-000000000001";
const variantId = "2a000007-0000-4000-8000-000000000001";
let online: OrderDetailResponse;
let pos: OrderDetailResponse;
let fulfilled: OrderDetailResponse;

beforeAll(async () => {
  const baseUrl = process.env.ONLINE_TEST_URL;
  if (
    !baseUrl ||
    !process.env.ONLINE_TEST_TOKEN ||
    !/^http:\/\/(127\.0\.0\.1|localhost):/.test(baseUrl)
  ) {
    throw new Error(
      "Supply the Phase 2L disposable loopback API and its test session; never use production.",
    );
  }
  process.env.EXPO_PUBLIC_COMMERCE_API_URL = baseUrl;
  configure({ asyncUtilTimeout: 10000 });
  const sdk = createCommerceClient({
    baseUrl,
    client: { type: "admin-mobile", version: "0.1.0" },
    getToken: () => process.env.ONLINE_TEST_TOKEN,
  });
  // Explicitly requested runtime checkout fixture, not application ordering functionality.
  const receipt = await sdk.checkout({
    tenantId,
    brandId,
    lines: [{ variantId, quantity: 1 }],
    customer: {
      name: "Mobile Runtime Guest",
      phone: "+201001234567",
      email: "mobile-runtime@example.com",
    },
    delivery: {
      recipientName: "Mobile Runtime Recipient",
      phone: "+201001234567",
      line1: "10 Runtime Street",
      line2: null,
      city: "Cairo",
      region: null,
      postalCode: null,
      countryCode: "EG",
      notes: "Call on arrival",
    },
    paymentMethod: "cash_on_delivery",
    expectedTotalMinor: 2500,
    expectedCurrency: "USD",
    idempotencyKey: crypto.randomUUID(),
  });
  const client = sdk.withTenant(tenantId);
  const items = await loadAllOrders(client);
  const item = items.find((order) => order.orderNumber === receipt.orderReference);
  if (!item) throw new Error("Checkout receipt missing from management list");
  online = await client.getOrder(item.id);
  const posItem = items.find((order) => order.channel === "pos");
  if (!posItem) throw new Error("API-side POS runtime fixture is required");
  pos = await client.getOrder(posItem.id);
  const details = await Promise.all(
    items.filter((order) => order.channel === "online").map((order) => client.getOrder(order.id)),
  );
  const complete = details.find((detail) =>
    detail.commerce?.reservations.some((hold) => hold.status === "consumed"),
  );
  if (!complete) throw new Error("API-side canonical fulfillment acceptance must run first");
  fulfilled = complete;
});

afterEach(cleanup);

function Harness({ initialId }: { initialId?: string }) {
  const { state } = useSession();
  const [orderId, setOrderId] = useState(initialId);
  if (state.phase !== "ready") return <span>{state.phase}</span>;
  return orderId ? (
    <OrderDetailScreen
      tenantId={state.tenantId}
      orderId={orderId}
      onBack={() => setOrderId(undefined)}
    />
  ) : (
    <OrdersListScreen
      tenantId={state.tenantId}
      context={state.context}
      onOpenOrder={setOrderId}
      onBack={() => {}}
    />
  );
}

function mount(initialId?: string) {
  render(
    <SessionProvider storage={createMemoryTenantStorage(tenantId)}>
      <Harness initialId={initialId} />
    </SessionProvider>,
  );
}

it("lists and opens a real checkout with snapshots, pending COD, reservation and fulfillment", async () => {
  mount();
  expect((await screen.findByTestId(`order-channel-${online.header.id}`)).textContent).toBe(
    "ONLINE",
  );
  fireEvent.click(screen.getByTestId("order-channel-filter-online"));
  fireEvent.click(await screen.findByTestId(`order-row-${online.header.id}`));
  await screen.findByText("Mobile Runtime Guest");
  for (const text of [
    "mobile-runtime@example.com",
    "Mobile Runtime Recipient",
    "10 Runtime Street",
    "Cairo",
    "EG",
    "Call on arrival",
    "Cash on delivery",
  ])
    expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getAllByText("+201001234567")).toHaveLength(2);
  expect(screen.getByTestId("order-payment-status").textContent).toBe("pending");
  expect(screen.getByTestId("order-reservation-0").textContent).toBe("Stock reserved");
  expect(screen.getByTestId("order-fulfillment-status").textContent).toBe("Unfulfilled");
  fireEvent.click(screen.getByText("Refresh order"));
  expect((await screen.findByTestId("order-payment-status")).textContent).toBe("pending");
});

it("renders the real API's canonical online fulfillment and consumed reservation", async () => {
  mount(fulfilled.header.id);
  expect((await screen.findByTestId("order-fulfillment-status")).textContent).toBe("Fulfilled");
  expect(screen.getByTestId("order-reservation-0").textContent).toBe("Consumed / fulfilled");
  expect(screen.getByTestId("order-payment-status").textContent).toBe("pending");
  expect(screen.getByText("3 / 3 fulfilled")).toBeTruthy();
});

it("keeps the real POS order visible with captured cash and its existing fulfillment", async () => {
  mount();
  await screen.findByTestId(`order-row-${pos.header.id}`);
  fireEvent.click(screen.getByTestId("order-channel-filter-pos"));
  fireEvent.click(await screen.findByTestId(`order-row-${pos.header.id}`));
  expect(await screen.findByText("POS")).toBeTruthy();
  expect(screen.getByText("Cash")).toBeTruthy();
  expect(screen.getByTestId("order-payment-status").textContent).toBe("captured");
  expect(screen.getByTestId("order-fulfillment-status").textContent).toBe("Fulfilled");
});
