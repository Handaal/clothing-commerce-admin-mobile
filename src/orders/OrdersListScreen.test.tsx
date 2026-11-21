// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MEMBERSHIP_A,
  ORDER_A,
  ORDER_B,
  TENANT_A,
  meContext,
  orderList,
  orderListItem,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { OrdersListScreen } from "./OrdersListScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  withTenant: vi.fn(),
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

// The real SDK boundary is preserved: the screen reaches the SDK only through
// SessionProvider → getTenantClient(tenantId) → withTenant(tenantId).listOrders().
vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => {
      mocks.withTenant(tenantId);
      return {
        tenantId,
        getContext: mocks.getContext,
        listOrders: mocks.listOrders,
        getOrder: mocks.getOrder,
      };
    },
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onOpenOrder = vi.fn();

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <OrdersListScreen
      tenantId={state.tenantId}
      context={state.context}
      onOpenOrder={onOpenOrder}
      onBack={() => {}}
    />
  );
}

function renderOrders() {
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
});

afterEach(() => cleanup());

describe("OrdersListScreen", () => {
  it("filters channels client-side from one load, shows chip counts, and returns to All", async () => {
    // One load returns the full set; channel switching is client-side (no extra API calls) so counts
    // stay accurate and switching is instant.
    mocks.listOrders.mockResolvedValue(
      orderList([
        orderListItem({ id: ORDER_A, orderNumber: "ORD-1001", channel: "online" }),
        orderListItem({ id: ORDER_B, orderNumber: "POS-2", channel: "pos" }),
      ]),
    );
    renderOrders();
    await screen.findByText("ORD-1001");
    await screen.findByText("POS-2");
    expect(mocks.listOrders).toHaveBeenCalledTimes(1);
    // Chip counts reflect the full set.
    expect(screen.getByTestId("order-channel-filter-all-count").textContent).toBe("2");
    expect(screen.getByTestId("order-channel-filter-pos-count").textContent).toBe("1");
    expect(screen.getByTestId("order-channel-filter-online-count").textContent).toBe("1");

    fireEvent.click(screen.getByTestId("order-channel-filter-pos"));
    await screen.findByText("POS-2");
    expect(screen.queryByText("ORD-1001")).toBeNull();
    // No new API call — filtering is client-side.
    expect(mocks.listOrders).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("order-channel-filter-online"));
    await screen.findByText("ORD-1001");
    expect(screen.queryByText("POS-2")).toBeNull();

    fireEvent.click(screen.getByTestId("order-channel-filter-all"));
    await screen.findByText("ORD-1001");
    await screen.findByText("POS-2");
  });

  it("searches loaded orders by order number and can clear to see all", async () => {
    mocks.listOrders.mockResolvedValue(
      orderList([
        orderListItem({ id: ORDER_A, orderNumber: "ORD-1001", channel: "online" }),
        orderListItem({ id: ORDER_B, orderNumber: "POS-2", channel: "pos" }),
      ]),
    );
    renderOrders();
    await screen.findByText("ORD-1001");
    fireEvent.change(screen.getByTestId("orders-search"), { target: { value: "pos-2" } });
    await screen.findByText("POS-2");
    expect(screen.queryByText("ORD-1001")).toBeNull();
    fireEvent.change(screen.getByTestId("orders-search"), { target: { value: "no-such-order" } });
    expect(await screen.findByText("No matches")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear search"));
    await screen.findByText("ORD-1001");
  });

  it("refreshes via the header action and reloads the full set", async () => {
    mocks.listOrders.mockResolvedValue(orderList([orderListItem()]));
    renderOrders();
    await screen.findByText("ORD-1001");
    fireEvent.click(screen.getByLabelText("Refresh orders"));
    await screen.findByText("ORD-1001");
    expect(mocks.listOrders).toHaveBeenCalledTimes(2);
  });
  it("shows a skeleton loading state while orders are being fetched", async () => {
    mocks.listOrders.mockReturnValue(new Promise(() => {}));
    renderOrders();
    expect(await screen.findByTestId("orders-loading")).toBeTruthy();
  });

  it("renders a populated list scoped to the tenant, with contract fields", async () => {
    mocks.listOrders.mockResolvedValue(
      orderList([
        orderListItem({
          id: ORDER_A,
          orderNumber: "ORD-1001",
          channel: "online",
          totalMinor: 12995,
        }),
      ]),
    );
    renderOrders();

    expect(await screen.findByText("ORD-1001")).toBeTruthy();
    expect(screen.getByTestId(`order-status-${ORDER_A}`).textContent).toBe("Placed");
    expect(screen.getByTestId(`order-channel-${ORDER_A}`).textContent).toMatch(/^Online · /);
    expect(screen.getByText("USD 129.95")).toBeTruthy();
    expect(screen.queryByText("Back")).toBeNull();
    expect(screen.getByLabelText("Refresh orders").textContent).toBe("");
    expect(mocks.withTenant).toHaveBeenCalledWith(TENANT_A);
    expect(mocks.listOrders).toHaveBeenCalledTimes(1);
  });

  it("shows an explicit empty state (not an error) when there are zero orders", async () => {
    mocks.listOrders.mockResolvedValue(orderList([]));
    renderOrders();
    expect(await screen.findByText(/No orders yet/)).toBeTruthy();
    fireEvent.click(screen.getByText("Refresh orders"));
    expect(mocks.listOrders).toHaveBeenCalledTimes(2);
  });

  it("follows the cursor and presents the full list, not just page one", async () => {
    mocks.listOrders
      .mockResolvedValueOnce(
        orderList([orderListItem({ id: ORDER_A, orderNumber: "ORD-1001" })], {
          hasMore: true,
          nextCursor: "cursor-1",
        }),
      )
      .mockResolvedValueOnce(
        orderList([orderListItem({ id: ORDER_B, orderNumber: "ORD-1002" })], {
          hasMore: false,
          nextCursor: null,
        }),
      );
    renderOrders();

    expect(await screen.findByText("ORD-1001")).toBeTruthy();
    expect(await screen.findByText("ORD-1002")).toBeTruthy();
    expect(mocks.listOrders).toHaveBeenCalledTimes(2);
    expect(mocks.listOrders.mock.calls[1][0]).toEqual({ cursor: "cursor-1" });
  });

  it("surfaces a classified network error with a retry, and retries on tap", async () => {
    mocks.listOrders
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(orderList([orderListItem({ orderNumber: "ORD-1001" })]));
    renderOrders();

    expect(await screen.findByText("No connection")).toBeTruthy();
    fireEvent.click(screen.getByText("Try again"));

    expect(await screen.findByText("ORD-1001")).toBeTruthy();
    expect(mocks.listOrders).toHaveBeenCalledTimes(2);
  });

  it("does NOT turn a 403 into an empty list — it shows access denied", async () => {
    mocks.listOrders.mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    renderOrders();

    expect(await screen.findByText("Not available for your account")).toBeTruthy();
    expect(screen.queryByText(/No orders yet/)).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("shows a no-access message and never calls the API without orders.read", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, {
        orders: { canRead: false, tenantWide: false, brands: [], branches: [] },
      }),
    );
    renderOrders();

    expect(await screen.findByText(/do not have read access to orders/)).toBeTruthy();
    expect(mocks.listOrders).not.toHaveBeenCalled();
  });

  it("navigates to detail with the real order id when a row is tapped", async () => {
    mocks.listOrders.mockResolvedValue(orderList([orderListItem({ id: ORDER_A })]));
    renderOrders();

    fireEvent.click(await screen.findByTestId(`order-row-${ORDER_A}`));
    expect(onOpenOrder).toHaveBeenCalledWith(ORDER_A);
  });

  it("does not refetch on an ordinary rerender", async () => {
    mocks.listOrders.mockResolvedValue(orderList([orderListItem({ orderNumber: "ORD-1001" })]));
    const tree = (
      <SessionProvider storage={createMemoryTenantStorage()}>
        <Harness />
      </SessionProvider>
    );
    const { rerender } = render(tree);

    await screen.findByText("ORD-1001");
    expect(mocks.listOrders).toHaveBeenCalledTimes(1);

    rerender(tree);
    await screen.findByText("ORD-1001");
    expect(mocks.listOrders).toHaveBeenCalledTimes(1);
  });

  it("does not auto-retry after a failure settles", async () => {
    mocks.listOrders.mockRejectedValue(new ApiNetworkError("down"));
    renderOrders();

    await screen.findByText("No connection");
    expect(mocks.listOrders).toHaveBeenCalledTimes(1);
  });

  it("exposes no order-mutation actions on the read surface", async () => {
    mocks.listOrders.mockResolvedValue(orderList([orderListItem({ orderNumber: "ORD-1001" })]));
    renderOrders();
    await screen.findByText("ORD-1001");
    expect(
      screen.queryByText(/cancel order|ship|pack|pick|refund|return|edit|create|save/i),
    ).toBeNull();
  });
});
