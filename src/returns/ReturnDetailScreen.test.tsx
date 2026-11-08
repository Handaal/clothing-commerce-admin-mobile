// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MEMBERSHIP_A,
  ORDER_A,
  RETURN_A,
  TENANT_A,
  meContext,
  returnDetail,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { ReturnDetailScreen } from "./ReturnDetailScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  getReturn: vi.fn(),
  settleRefund: vi.fn(),
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
        getReturn: mocks.getReturn,
        settleRefund: mocks.settleRefund,
      };
    },
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

// Keep expo-crypto (native module needing __DEV__) out of the jsdom module graph; tests inject keys.
vi.mock("expo-crypto", () => ({ randomUUID: () => "mock-uuid" }));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onBack = vi.fn();
const onOpenOrder = vi.fn();

function Harness({ returnId }: { returnId: string }) {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <ReturnDetailScreen
      tenantId={state.tenantId}
      returnId={returnId}
      onBack={onBack}
      onOpenOrder={onOpenOrder}
      generateIdempotencyKey={() => "fixed-key"}
    />
  );
}

function renderDetail(returnId = RETURN_A) {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness returnId={returnId} />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
});

afterEach(() => cleanup());

describe("ReturnDetailScreen", () => {
  it("renders server return fields: order, refund, disposition and lines", async () => {
    mocks.getReturn.mockResolvedValue(returnDetail());
    renderDetail();

    await screen.findByTestId("return-detail-status");
    expect(screen.getByTestId("return-detail-status").textContent).toBe("accepted");
    expect(screen.getByTestId("return-detail-channel").textContent).toBe("POS");
    expect(screen.getByText(ORDER_A)).toBeTruthy();
    // Returned value, refund amount and the single line refund all render this amount.
    expect(screen.getAllByText("USD 25.99").length).toBeGreaterThanOrEqual(1);
    // Refund state exact + method, and the operational restock effect.
    expect(screen.getByTestId("return-refund-status").textContent).toBe("Refund succeeded");
    expect(screen.getByText("Cash")).toBeTruthy();
    expect(screen.getByText(/re-entered sellable inventory/)).toBeTruthy();
    // Line: quantity, reason, disposition.
    expect(screen.getByTestId("return-line-1")).toBeTruthy();
    expect(screen.getByText("Wrong size")).toBeTruthy();
    expect(screen.getByText("Restocked")).toBeTruthy();
    expect(mocks.getReturn).toHaveBeenCalledWith(RETURN_A);
  });

  it("shows a pending refund as owed and never as settled", async () => {
    mocks.getReturn.mockResolvedValue(
      returnDetail({
        inventoryOperationId: null,
        inventoryLocationId: null,
        lines: [
          {
            orderLineId: "e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5",
            lineNumber: 1,
            variantId: "77777777-7777-4777-8777-777777777777",
            quantity: 1,
            reason: "Damaged",
            disposition: "non_restock",
            amountMinor: 2599,
          },
        ],
        refund: {
          id: "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3",
          paymentId: "d4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4",
          returnId: RETURN_A,
          method: "electronic",
          status: "pending",
          amountMinor: 2599,
          currency: "USD",
          settlementReference: null,
          settledAt: null,
        },
      }),
    );
    renderDetail();

    await screen.findByTestId("return-refund-status");
    expect(screen.getByTestId("return-refund-status").textContent).toBe("Refund pending");
    expect(screen.getByText(/Settlement is still owed/)).toBeTruthy();
    // Non-restock path: no stock receipt, and the write-off wording is shown.
    expect(screen.getByText(/did not re-enter sellable inventory/)).toBeTruthy();
    expect(screen.getByText("Not restocked (damaged / write-off)")).toBeTruthy();
  });

  it("offers navigation back to the original order", async () => {
    mocks.getReturn.mockResolvedValue(returnDetail());
    renderDetail();
    fireEvent.click(await screen.findByText("View original order"));
    expect(onOpenOrder).toHaveBeenCalledWith(ORDER_A);
  });

  it("maps 404, 403 and network states distinctly", async () => {
    mocks.getReturn.mockRejectedValueOnce(new ApiHttpError("gone", 404, "RETURN_NOT_FOUND", null));
    const notFound = renderDetail();
    expect(await screen.findByText("Not found")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
    notFound.unmount();

    mocks.getReturn.mockRejectedValueOnce(new ApiHttpError("no", 403, "FORBIDDEN", null));
    const denied = renderDetail();
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText("Try again")).toBeNull();
    denied.unmount();

    mocks.getReturn.mockRejectedValueOnce(new ApiNetworkError("down"));
    renderDetail();
    expect(await screen.findByText("Cannot reach the Commerce API")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("exposes no refund mutation control for a settled refund", async () => {
    // The default fixture is a succeeded refund; settlement is offered only for a pending one.
    mocks.getReturn.mockResolvedValue(returnDetail());
    renderDetail();
    await screen.findByTestId("return-detail-status");
    expect(screen.queryByTestId("settle-refund-submit")).toBeNull();
  });
});

const pendingCashRefund = () =>
  returnDetail({
    refund: {
      ...returnDetail().refund,
      status: "pending",
      method: "cash",
      settledAt: null,
      settlementReference: null,
    },
  });

describe("ReturnDetailScreen settle-refund", () => {
  it("records a manual refund for a pending cash return and re-reads the detail", async () => {
    mocks.getReturn.mockResolvedValue(pendingCashRefund());
    mocks.settleRefund.mockResolvedValue(returnDetail());
    renderDetail();

    fireEvent.change(await screen.findByTestId("settle-refund-reference"), {
      target: { value: "till-42" },
    });
    fireEvent.click(screen.getByTestId("settle-refund-confirm"));
    fireEvent.click(screen.getByTestId("settle-refund-submit"));

    await waitFor(() => expect(mocks.settleRefund).toHaveBeenCalledTimes(1));
    expect(mocks.settleRefund).toHaveBeenCalledWith({
      returnId: RETURN_A,
      idempotencyKey: "fixed-key",
      settlementReference: "till-42",
    });
    // On success the detail is re-read (initial load + post-settle reload).
    await waitFor(() => expect(mocks.getReturn).toHaveBeenCalledTimes(2));
  });

  it("requires the attestation before recording", async () => {
    mocks.getReturn.mockResolvedValue(pendingCashRefund());
    renderDetail();
    fireEvent.change(await screen.findByTestId("settle-refund-reference"), {
      target: { value: "till-42" },
    });
    fireEvent.click(screen.getByTestId("settle-refund-submit"));
    expect(mocks.settleRefund).not.toHaveBeenCalled();
  });

  it("hides the settle panel for an electronic refund", async () => {
    mocks.getReturn.mockResolvedValue(
      returnDetail({
        refund: { ...returnDetail().refund, status: "pending", method: "electronic" },
      }),
    );
    renderDetail();
    await screen.findByTestId("return-detail-status");
    expect(screen.queryByTestId("settle-refund-submit")).toBeNull();
  });
});
