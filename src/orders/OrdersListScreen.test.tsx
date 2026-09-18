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
  it("filters through the API, preserves channel across pages, and can return to All", async () => {
    mocks.listOrders
      .mockResolvedValueOnce(orderList([orderListItem()]))
      .mockResolvedValueOnce(
        orderList([orderListItem({ channel: "pos", orderNumber: "POS-1" })], {
          hasMore: true,
          nextCursor: "pos-next",
        }),
      )
      .mockResolvedValueOnce(
        orderList([orderListItem({ id: ORDER_B, channel: "pos", orderNumber: "POS-2" })]),
      )
      .mockResolvedValueOnce(orderList([]))
      .mockResolvedValueOnce(orderList([orderListItem()]));
    renderOrders();
    await screen.findByText("ORD-1001");
    fireEvent.click(screen.getByTestId("order-channel-filter-pos"));
    await screen.findByText("POS-2");
    expect(screen.queryByText("ORD-1001")).toBeNull();
    expect(screen.getByTestId(`order-channel-${ORDER_A}`).textContent).toBe("POS");
    expect(mocks.listOrders.mock.calls[2][0]).toEqual({ channel: "pos", cursor: "pos-next" });
    fireEvent.click(screen.getByTestId("order-channel-filter-online"));
    await screen.findByText("No online orders found.");
    expect(mocks.listOrders.mock.calls[3][0]).toEqual({ channel: "online", cursor: undefined });
    fireEvent.click(screen.getByTestId("order-channel-filter-all"));
    await screen.findByText("ORD-1001");
    expect(mocks.listOrders.mock.calls[4][0]).toEqual({ cursor: undefined });
  });

  it("refreshes the active channel from the first page", async () => {
    mocks.listOrders.mockResolvedValue(orderList([orderListItem()]));
    renderOrders();
    await screen.findByText("ORD-1001");
    fireEvent.click(screen.getByTestId("order-channel-filter-online"));
    await screen.findByText("ORD-1001");
    fireEvent.click(screen.getByText("Refresh orders"));
    await screen.findByText("ORD-1001");
    expect(mocks.listOrders).toHaveBeenLastCalledWith({ channel: "online", cursor: undefined });
    expect(mocks.listOrders).toHaveBeenCalledTimes(3);
  });
  it("shows a loading state while orders are being fetched", async () => {
    mocks.listOrders.mockReturnValue(new Promise(() => {}));
    renderOrders();
    expect(await screen.findByText("Loading orders…")).toBeTruthy();
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
    expect(screen.getByTestId(`order-status-${ORDER_A}`).textContent).toBe("placed");
    expect(screen.getByText("ONLINE")).toBeTruthy();
    expect(screen.getByText("USD 129.95")).toBeTruthy();
    expect(mocks.withTenant).toHaveBeenCalledWith(TENANT_A);
    expect(mocks.listOrders).toHaveBeenCalledTimes(1);
  });

  it("shows an explicit empty state (not an error) when there are zero orders", async () => {
    mocks.listOrders.mockResolvedValue(orderList([]));
    renderOrders();
    expect(await screen.findByText(/No orders yet/)).toBeTruthy();
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

    expect(await screen.findByText("Cannot reach the Commerce API")).toBeTruthy();
    fireEvent.click(screen.getByText("Try again"));

    expect(await screen.findByText("ORD-1001")).toBeTruthy();
    expect(mocks.listOrders).toHaveBeenCalledTimes(2);
  });

  it("does NOT turn a 403 into an empty list — it shows access denied", async () => {
    mocks.listOrders.mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    renderOrders();

    expect(await screen.findByText("Access denied")).toBeTruthy();
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

    await screen.findByText("Cannot reach the Commerce API");
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
