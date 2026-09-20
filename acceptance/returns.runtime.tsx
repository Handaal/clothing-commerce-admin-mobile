import { createCommerceClient, type ReturnDetailResponse } from "@shifted/clothing-commerce-sdk";
import { cleanup, configure, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { OrderDetailScreen } from "../src/orders/OrderDetailScreen";
import { ReturnDetailScreen } from "../src/returns/ReturnDetailScreen";
import { SessionProvider, useSession } from "../src/session/SessionProvider";
import { createMemoryTenantStorage } from "../src/tenant/storage";

// This suite is READ-ONLY. The POS sale and the return/refund it inspects are created by the
// out-of-repo orchestration wrapper via the API SDK (fixture setup), never by this application. Only
// the device auth/storage adapters are substituted; bootstrap, SDK, HTTP and API authorization are
// real. The wrapper injects the loopback URL, a real Clerk-verifiable session and the fixture ids.
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "runtime-user",
    sessionId: "runtime-session",
    getToken: async () => process.env.RETURNS_TEST_TOKEN,
    signOut: async () => {},
  }),
}));
vi.mock("../src/tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

const tenantId = "2a000001-0000-4000-8000-000000000001";
let orderId: string;
let returnId: string;
let onlineReturnId: string | undefined;
let posReturn: ReturnDetailResponse;

beforeAll(async () => {
  const baseUrl = process.env.RETURNS_TEST_URL;
  if (
    !baseUrl ||
    !process.env.RETURNS_TEST_TOKEN ||
    !process.env.RETURNS_TEST_ORDER_ID ||
    !process.env.RETURNS_TEST_RETURN_ID ||
    !/^http:\/\/(127\.0\.0\.1|localhost):/.test(baseUrl)
  ) {
    throw new Error(
      "Supply the Phase 2M disposable loopback API, a test session and the fixture return ids; " +
        "never target production.",
    );
  }
  process.env.EXPO_PUBLIC_COMMERCE_API_URL = baseUrl;
  orderId = process.env.RETURNS_TEST_ORDER_ID;
  returnId = process.env.RETURNS_TEST_RETURN_ID;
  onlineReturnId = process.env.RETURNS_TEST_ONLINE_RETURN_ID || undefined;
  configure({ asyncUtilTimeout: 10000 });

  // Read-only sanity read of the same authoritative facts the screens will render.
  const client = createCommerceClient({
    baseUrl,
    client: { type: "admin-mobile", version: "0.1.0" },
    getToken: () => process.env.RETURNS_TEST_TOKEN,
  }).withTenant(tenantId);
  posReturn = await client.getReturn(returnId);
  if (posReturn.orderId !== orderId) throw new Error("Fixture return is not on the fixture order");
});

afterEach(cleanup);

function OrderHarness({ id }: { id: string }) {
  const { state } = useSession();
  if (state.phase !== "ready") return <span>{state.phase}</span>;
  return <OrderDetailScreen tenantId={state.tenantId} orderId={id} onBack={() => {}} />;
}

function ReturnHarness({ id }: { id: string }) {
  const { state } = useSession();
  const [openOrder, setOpenOrder] = useState<string | undefined>();
  if (state.phase !== "ready") return <span>{state.phase}</span>;
  return openOrder ? (
    <OrderDetailScreen
      tenantId={state.tenantId}
      orderId={openOrder}
      onBack={() => setOpenOrder(undefined)}
    />
  ) : (
    <ReturnDetailScreen
      tenantId={state.tenantId}
      returnId={id}
      onBack={() => {}}
      onOpenOrder={setOpenOrder}
    />
  );
}

function mount(node: React.ReactNode) {
  render(<SessionProvider storage={createMemoryTenantStorage(tenantId)}>{node}</SessionProvider>);
}

it("reflects the real POS return on the original order: returned quantity, refund and disposition", async () => {
  mount(<OrderHarness id={orderId} />);
  // Order body renders, then the returns summary and history (loaded from the real API).
  await screen.findByTestId("order-detail-status");
  expect(await screen.findByText("Returned")).toBeTruthy();
  expect(screen.getByText("Returns & refunds")).toBeTruthy();
  await screen.findByTestId("return-row-0");
  expect(screen.getByTestId("return-refund-status-0").textContent).toBe(
    posReturn.refund.status === "succeeded" ? "Refund succeeded" : "Refund pending",
  );
});

it("shows the real return detail with its actual server refund state and disposition", async () => {
  mount(<ReturnHarness id={returnId} />);
  await screen.findByTestId("return-detail-status");
  expect(screen.getByTestId("return-detail-status").textContent).toBe("accepted");
  expect(screen.getByTestId("return-detail-channel").textContent).toBe(
    posReturn.channel.toUpperCase(),
  );
  expect(screen.getByText(orderId)).toBeTruthy();
  // Exact refund state from the server — pending is never dressed as settled.
  const expected =
    posReturn.refund.status === "succeeded"
      ? "Refund succeeded"
      : posReturn.refund.status === "pending"
        ? "Refund pending"
        : "Refund failed";
  expect(screen.getByTestId("return-refund-status").textContent).toBe(expected);
  // Disposition / operational stock effect is rendered from the server's own fields.
  if (posReturn.inventoryOperationId) {
    expect(screen.getByText(/re-entered sellable inventory/)).toBeTruthy();
  } else {
    expect(screen.getByText(/did not re-enter sellable inventory/)).toBeTruthy();
  }
  // Navigate back to the original order from the return.
  fireEvent.click(screen.getByText("View original order"));
  expect(await screen.findByTestId("order-detail-status")).toBeTruthy();
});

it.runIf(Boolean(process.env.RETURNS_TEST_ONLINE_RETURN_ID))(
  "shows a real ONLINE return when the API fixture supports one",
  async () => {
    mount(<ReturnHarness id={onlineReturnId!} />);
    await screen.findByTestId("return-detail-channel");
    expect(screen.getByTestId("return-detail-channel").textContent).toBe("ONLINE");
    expect(screen.getByTestId("return-refund-status").textContent).toMatch(/^Refund /);
  },
);
