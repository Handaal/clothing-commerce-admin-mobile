// @vitest-environment jsdom
import { ApiContractError, ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import type { OrderDetailResponse } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MEMBERSHIP_A,
  ORDER_A,
  ORDER_B,
  TENANT_A,
  meContext,
  orderDetail,
  orderCommerce,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { OrderDetailScreen } from "./OrderDetailScreen";

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

const onBack = vi.fn();

function Harness({ orderId }: { orderId: string }) {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return <OrderDetailScreen tenantId={state.tenantId} orderId={orderId} onBack={onBack} />;
}

function renderDetail(orderId = ORDER_A, storage = createMemoryTenantStorage()) {
  return render(
    <SessionProvider storage={storage}>
      <Harness orderId={orderId} />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
});

afterEach(() => cleanup());

describe("OrderDetailScreen", () => {
  it("shows checkout snapshots, pending COD and partial consumption without inventing completion", async () => {
    mocks.getOrder.mockResolvedValue(orderDetail({ commerce: orderCommerce() }));
    renderDetail();
    expect(await screen.findByText("Checkout Guest")).toBeTruthy();
    for (const value of [
      "guest@example.com",
      "+201001234567",
      "Checkout Recipient",
      "+201009876543",
      "10 Example Street",
      "Apartment 2",
      "Cairo",
      "Cairo Governorate",
      "11511",
      "EG",
      "Call on arrival",
    ]) {
      expect(screen.getByText(value)).toBeTruthy();
    }
    expect(screen.getByText(/separate from a customer profile/)).toBeTruthy();
    expect(screen.getByTestId("order-payment-status").textContent).toBe("pending");
    expect(screen.getByText("Cash on delivery")).toBeTruthy();
    expect(screen.getByTestId("order-reservation-0").textContent).toBe("Stock reserved");
    expect(screen.getByTestId("order-fulfillment-status").textContent).toBe("Partially fulfilled");
    expect(screen.queryByRole("button", { name: /capture|refund|edit|fulfill/i })).toBeNull();
  });

  it.each(["pending", "authorized", "captured", "failed", "cancelled", "refunded"] as const)(
    "renders the API payment state %s without deriving it from fulfillment",
    async (status) => {
      mocks.getOrder.mockResolvedValue(
        orderDetail({
          commerce: orderCommerce({
            payment: {
              method: "electronic",
              status,
              provider: "Example provider",
              amountMinor: 5000,
              currency: "EUR",
            },
          }),
        }),
      );
      renderDetail();
      expect((await screen.findByTestId("order-payment-status")).textContent).toBe(status);
      expect(screen.getByText("Electronic")).toBeTruthy();
      expect(screen.getByText("EUR 50.00")).toBeTruthy();
    },
  );

  it.each([
    ["active", "Stock reserved"],
    ["consumed", "Consumed / fulfilled"],
    ["released", "Released"],
    ["expired", "Expired — needs attention"],
  ] as const)(
    "renders server reservation state %s without local expiry calculations",
    async (status, label) => {
      const reservation = orderCommerce().reservations[0];
      mocks.getOrder.mockResolvedValue(
        orderDetail({
          commerce: orderCommerce({
            reservations: [{ ...reservation, status, expiresAt: "2020-01-01T00:00:00.000Z" }],
          }),
        }),
      );
      renderDetail();
      expect((await screen.findByTestId("order-reservation-0")).textContent).toBe(label);
      expect(screen.getByText("2020-01-01T00:00:00.000Z")).toBeTruthy();
    },
  );

  it.each([
    undefined,
    orderCommerce({ customer: null, delivery: null, payment: null, reservations: [] }),
  ])("handles absent commerce fields without inventing facts", async (commerce) => {
    mocks.getOrder.mockResolvedValue(orderDetail({ commerce }));
    renderDetail();
    expect(
      await screen.findByText("Customer snapshot is not available for this order."),
    ).toBeTruthy();
    expect(screen.getByText("Delivery snapshot is not available for this order.")).toBeTruthy();
    expect(screen.getByText("Payment information is not available for this order.")).toBeTruthy();
    expect(
      screen.getByText("No stock commitment information supplied for this order."),
    ).toBeTruthy();
    expect(screen.queryByTestId("order-payment-status")).toBeNull();
  });

  it("preserves POS detail with captured cash and no checkout snapshots", async () => {
    mocks.getOrder.mockResolvedValue(
      orderDetail({
        header: { ...orderDetail().header, channel: "pos" },
        commerce: orderCommerce({
          customer: null,
          delivery: null,
          reservations: [],
          payment: {
            method: "cash",
            provider: null,
            status: "captured",
            amountMinor: 12995,
            currency: "USD",
          },
        }),
      }),
    );
    renderDetail();
    expect(await screen.findByText("POS")).toBeTruthy();
    expect(screen.getByText("Cash")).toBeTruthy();
    expect(screen.getByTestId("order-payment-status").textContent).toBe("captured");
    expect(screen.getByText("3 / 3 fulfilled")).toBeTruthy();
  });

  it("refreshes operational state and removes stale detail when the refresh fails", async () => {
    mocks.getOrder
      .mockResolvedValueOnce(orderDetail({ commerce: orderCommerce() }))
      .mockResolvedValueOnce(
        orderDetail({ commerce: orderCommerce({ payment: null, reservations: [] }) }),
      )
      .mockRejectedValueOnce(new ApiNetworkError("offline"));
    renderDetail();
    await screen.findByTestId("order-payment-status");
    fireEvent.click(screen.getByText("Refresh order"));
    await screen.findByText("Payment information is not available for this order.");
    expect(screen.queryByTestId("order-payment-status")).toBeNull();
    fireEvent.click(screen.getByText("Refresh order"));
    await screen.findByText("Cannot reach the Commerce API");
    expect(screen.queryByText("Checkout Guest")).toBeNull();
  });

  it("distinguishes unsupported response data from a network failure", async () => {
    mocks.getOrder.mockRejectedValue(new ApiContractError("unsupported response"));
    renderDetail();
    expect(await screen.findByText("Unexpected response")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });
  it("shows a loading state while the order is being fetched", async () => {
    mocks.getOrder.mockReturnValue(new Promise(() => {}));
    renderDetail();
    expect(await screen.findByText("Loading order…")).toBeTruthy();
  });

  it("renders order summary, lines, totals and fulfillment on success", async () => {
    mocks.getOrder.mockResolvedValue(orderDetail());
    renderDetail();

    // Summary
    expect(await screen.findByText("ORD-1001")).toBeTruthy();
    expect(screen.getByTestId("order-detail-status").textContent).toBe("placed");
    expect(screen.getByText("ONLINE")).toBeTruthy();
    expect(screen.getByText("USD 129.95")).toBeTruthy();

    // Lines (two lines, both "Linen Shirt")
    expect(screen.getAllByText("Linen Shirt")).toHaveLength(2);
    expect(screen.getByText("LS-001-M")).toBeTruthy();
    expect(screen.getByText("LS-001-L")).toBeTruthy();
    // Both lines share the same unit price; the two line totals are distinct.
    expect(screen.getAllByText("USD 25.99")).toHaveLength(2);
    expect(screen.getByText("USD 77.97")).toBeTruthy();
    expect(screen.getByText("USD 51.98")).toBeTruthy();

    // Fulfillment: one full line, one partial, overall partial
    expect(screen.getByText("3 / 3 fulfilled")).toBeTruthy();
    expect(screen.getByText("1 / 2 fulfilled")).toBeTruthy();
    expect(screen.getByTestId("order-fulfillment-status").textContent).toBe("Partially fulfilled");

    expect(mocks.withTenant).toHaveBeenCalledWith(TENANT_A);
    expect(mocks.getOrder).toHaveBeenCalledWith(ORDER_A);
  });

  it("does not falsely mark a partially fulfilled order as complete", async () => {
    mocks.getOrder.mockResolvedValue(orderDetail());
    renderDetail();
    await screen.findByText("ORD-1001");
    expect(screen.getByTestId("order-fulfillment-status").textContent).not.toBe("Fulfilled");
  });

  it("shows a not-found state for a 404 (no retry, back available)", async () => {
    mocks.getOrder.mockRejectedValue(new ApiHttpError("gone", 404, "NOT_FOUND", null));
    renderDetail();

    expect(await screen.findByText("Not found")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("shows an access-denied state for a 403 (no retry)", async () => {
    mocks.getOrder.mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    renderDetail();

    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("surfaces a network error with a retry, and retries on tap", async () => {
    mocks.getOrder
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(orderDetail());
    renderDetail();

    fireEvent.click(await screen.findByText("Try again"));

    expect(await screen.findByText("ORD-1001")).toBeTruthy();
    expect(mocks.getOrder).toHaveBeenCalledTimes(2);
  });

  it("invokes onBack when the back control is tapped", async () => {
    mocks.getOrder.mockResolvedValue(orderDetail());
    renderDetail();
    await screen.findByText("ORD-1001");

    fireEvent.click(screen.getByText(/Back/));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("exposes no order-mutation actions on the read surface", async () => {
    mocks.getOrder.mockResolvedValue(orderDetail());
    renderDetail();
    await screen.findByText("ORD-1001");
    // Action verbs only — "fulfilled" quantity labels are legitimate read-only content.
    expect(
      screen.queryByText(/^(cancel order|ship|pack|pick|refund|return|edit|save|create)$/i),
    ).toBeNull();
  });

  it("when orderId changes, a slow previous-order response cannot overwrite the new order", async () => {
    // Order A never resolves during the test; Order B resolves immediately.
    let resolveA: ((value: OrderDetailResponse) => void) | undefined;
    mocks.getOrder.mockImplementation((id: string) => {
      if (id === ORDER_A) {
        return new Promise<OrderDetailResponse>((resolve) => {
          resolveA = resolve;
        });
      }
      return Promise.resolve(
        orderDetail({ header: { ...orderDetail().header, id: ORDER_B, orderNumber: "ORD-2002" } }),
      );
    });

    const storage = createMemoryTenantStorage();
    const tree = (id: string) => (
      <SessionProvider storage={storage}>
        <Harness orderId={id} />
      </SessionProvider>
    );
    const { rerender } = render(tree(ORDER_A));

    // A is in flight → loading.
    await screen.findByText("Loading order…");

    // Navigate to B (same provider instance) → B settles.
    rerender(tree(ORDER_B));
    expect(await screen.findByText("ORD-2002")).toBeTruthy();

    // A's late resolution must be ignored — B stays the final state.
    resolveA?.(
      orderDetail({ header: { ...orderDetail().header, id: ORDER_A, orderNumber: "ORD-1001" } }),
    );
    await Promise.resolve();
    expect(screen.queryByText("ORD-1001")).toBeNull();
    expect(screen.getByText("ORD-2002")).toBeTruthy();
  });
});
