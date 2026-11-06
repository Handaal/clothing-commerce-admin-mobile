// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INVENTORY_LOCATION_A,
  MEMBERSHIP_A,
  ORDER_A,
  ORDER_LINE_A,
  TENANT_A,
  meContext,
  orderDetail,
  returnDetail,
  returnEligibility,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { CreateReturnScreen } from "./CreateReturnScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  getOrder: vi.fn(),
  getReturnEligibility: vi.fn(),
  createReturn: vi.fn(),
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
      getOrder: mocks.getOrder,
      getReturnEligibility: mocks.getReturnEligibility,
      createReturn: mocks.createReturn,
    }),
  }),
}));

vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

// Keep expo-crypto (native module needing __DEV__) out of the jsdom module graph; tests inject keys.
vi.mock("expo-crypto", () => ({ randomUUID: () => "mock-uuid" }));

import { SessionProvider, useSession } from "../session/SessionProvider";

const onCreated = vi.fn();
const onBack = vi.fn();

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <CreateReturnScreen
      tenantId={state.tenantId}
      orderId={ORDER_A}
      context={state.context}
      onCreated={onCreated}
      onBack={onBack}
      generateIdempotencyKey={() => "fixed-key"}
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
  mocks.getOrder.mockResolvedValue(orderDetail());
  mocks.getReturnEligibility.mockResolvedValue(returnEligibility());
  mocks.createReturn.mockResolvedValue(returnDetail());
});

afterEach(() => cleanup());

describe("CreateReturnScreen", () => {
  it("creates a non-restock return with a pending refund", async () => {
    renderScreen();
    fireEvent.click(await screen.findByTestId("create-return-select-1"));
    fireEvent.change(screen.getByTestId("create-return-qty-1"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("create-return-reason-1"), {
      target: { value: "Wrong size" },
    });
    fireEvent.click(screen.getByTestId("create-return-review"));
    fireEvent.click(screen.getByTestId("create-return-submit"));

    await waitFor(() => expect(mocks.createReturn).toHaveBeenCalledTimes(1));
    expect(mocks.createReturn).toHaveBeenCalledWith({
      orderId: ORDER_A,
      idempotencyKey: "fixed-key",
      lines: [
        {
          orderLineId: ORDER_LINE_A,
          quantity: 2,
          reason: "Wrong size",
          disposition: "non_restock",
        },
      ],
      inventoryLocationId: null,
      refundMode: "pending",
      settlementReference: null,
    });
    expect(await screen.findByTestId("create-return-success")).toBeTruthy();
  });

  it("blocks a restock return when no receiving location is available", async () => {
    renderScreen();
    fireEvent.click(await screen.findByTestId("create-return-select-1"));
    fireEvent.change(screen.getByTestId("create-return-qty-1"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("create-return-reason-1"), {
      target: { value: "Damaged" },
    });
    fireEvent.click(screen.getByTestId("create-return-disposition-1-restock"));

    // No receive capability in the default context → explicit notice and a disabled review action.
    expect(await screen.findByTestId("create-return-no-receive")).toBeTruthy();
    expect((screen.getByTestId("create-return-review") as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.createReturn).not.toHaveBeenCalled();
  });

  it("restocks into a chosen receiving location when the operator may receive", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, {
        inventory: {
          canRead: true,
          tenantWide: true,
          locations: [{ id: INVENTORY_LOCATION_A, name: "Main", branchId: null }],
          write: {
            canReceive: true,
            canAdjust: false,
            canTransfer: false,
            locations: [
              {
                id: INVENTORY_LOCATION_A,
                name: "Main",
                canReceive: true,
                canAdjust: false,
                canTransferOrigin: false,
                canTransferDestination: false,
              },
            ],
          },
        },
      }),
    );
    renderScreen();
    fireEvent.click(await screen.findByTestId("create-return-select-1"));
    fireEvent.change(screen.getByTestId("create-return-qty-1"), { target: { value: "1" } });
    fireEvent.change(screen.getByTestId("create-return-reason-1"), {
      target: { value: "Damaged" },
    });
    fireEvent.click(screen.getByTestId("create-return-disposition-1-restock"));
    fireEvent.click(await screen.findByTestId(`create-return-location-${INVENTORY_LOCATION_A}`));
    fireEvent.click(screen.getByTestId("create-return-review"));
    fireEvent.click(screen.getByTestId("create-return-submit"));

    await waitFor(() => expect(mocks.createReturn).toHaveBeenCalledTimes(1));
    expect(mocks.createReturn.mock.calls[0][0].inventoryLocationId).toBe(INVENTORY_LOCATION_A);
    expect(mocks.createReturn.mock.calls[0][0].lines[0].disposition).toBe("restock");
  });

  it("shows the not-eligible state and never calls createReturn", async () => {
    mocks.getReturnEligibility.mockResolvedValue(
      returnEligibility({ eligible: false, reason: "Outside return window" }),
    );
    renderScreen();
    expect(await screen.findByText("This order cannot be returned")).toBeTruthy();
    expect(mocks.createReturn).not.toHaveBeenCalled();
  });
});
