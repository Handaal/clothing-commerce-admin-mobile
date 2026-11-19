// @vitest-environment jsdom
import type { ReturnRequest } from "@shifted/clothing-commerce-sdk";
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { nextStatuses } from "./ReturnRequestCard";
import { ReturnRequestsScreen, replaceRequest } from "./ReturnRequestsScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listReturnRequests: vi.fn(),
  updateReturnRequestStatus: vi.fn(),
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

const onOpenOrder = vi.fn();

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <ReturnRequestsScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => {}}
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

const REQUEST: ReturnRequest = {
  id: "c1000000-0000-4000-8000-000000000001",
  reference: "1042-R1",
  orderId: "d1000000-0000-4000-8000-000000000001",
  orderNumber: "1042",
  brandId: "e1000000-0000-4000-8000-000000000001",
  status: "requested",
  preference: "exchange",
  customerNote: "Same shirt in L please",
  staffNote: null,
  customerName: "Omar Hassan",
  customerPhone: "+201001234567",
  createdAt: "2026-11-19T10:00:00.000Z",
  decidedAt: null,
  lines: [
    {
      lineNumber: 1,
      productName: "Linen shirt",
      variantName: "M",
      optionSummary: "M · Sand",
      sku: "LS-M-SAND",
      quantity: 1,
      reason: "too_small",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
});

afterEach(() => cleanup());

describe("ReturnRequestsScreen", () => {
  it("lists open requests with items, reasons and the customer's note", async () => {
    mocks.listReturnRequests.mockResolvedValue({ requests: [REQUEST], awaitingDecision: 1 });
    renderScreen();
    expect(await screen.findByTestId("return-request-1042-R1")).toBeTruthy();
    expect(screen.getByText("1 × Linen shirt")).toBeTruthy();
    expect(screen.getByText("M · Sand · Too small")).toBeTruthy();
    expect(screen.getByText("“Same shirt in L please”")).toBeTruthy();
    expect(screen.getByText("An exchange")).toBeTruthy();
    expect(mocks.listReturnRequests).toHaveBeenCalledWith({ status: "open", limit: 100 });
  });

  it("approves with a note and a fresh idempotency key", async () => {
    mocks.listReturnRequests.mockResolvedValue({ requests: [REQUEST], awaitingDecision: 1 });
    mocks.updateReturnRequestStatus.mockResolvedValue({
      ...REQUEST,
      status: "approved",
      staffNote: "Pickup Sunday",
      decidedAt: "2026-11-19T11:00:00.000Z",
    });
    renderScreen();
    fireEvent.change(await screen.findByTestId("return-request-note-1042-R1"), {
      target: { value: "Pickup Sunday" },
    });
    fireEvent.click(screen.getByTestId("return-request-approved-1042-R1"));
    await waitFor(() =>
      expect(screen.getByTestId("return-request-status-1042-R1").textContent).toContain("Approved"),
    );
    expect(mocks.updateReturnRequestStatus).toHaveBeenCalledWith({
      requestId: REQUEST.id,
      status: "approved",
      idempotencyKey: expect.any(String),
      note: "Pickup Sunday",
    });
    // Approved requests offer completion next.
    expect(screen.getByTestId("return-request-completed-1042-R1")).toBeTruthy();
  });

  it("explains a conflicting change", async () => {
    mocks.listReturnRequests.mockResolvedValue({ requests: [REQUEST], awaitingDecision: 1 });
    mocks.updateReturnRequestStatus.mockRejectedValue(
      new ApiHttpError("conflict", 409, "RETURN_REQUEST_STATUS_CONFLICT", null),
    );
    renderScreen();
    fireEvent.click(await screen.findByTestId("return-request-declined-1042-R1"));
    expect(
      await screen.findByText("Someone already changed this request. Pull down to refresh."),
    ).toBeTruthy();
  });

  it("shows an access notice on 403 and an empty state otherwise", async () => {
    mocks.listReturnRequests.mockRejectedValueOnce(
      new ApiHttpError("forbidden", 403, "PERMISSION_DENIED", null),
    );
    renderScreen();
    expect(await screen.findByText("No access to returns")).toBeTruthy();
    cleanup();
    mocks.listReturnRequests.mockResolvedValue({ requests: [], awaitingDecision: 0 });
    renderScreen();
    expect(await screen.findByTestId("return-requests-empty")).toBeTruthy();
  });

  it("knows which decisions follow each status and keeps the counter right", () => {
    expect(nextStatuses("requested")).toEqual(["approved", "declined"]);
    expect(nextStatuses("approved")).toEqual(["completed", "declined"]);
    expect(nextStatuses("completed")).toEqual([]);
    expect(
      replaceRequest(
        { requests: [REQUEST], awaitingDecision: 1 },
        { ...REQUEST, status: "declined" },
      ).awaitingDecision,
    ).toBe(0);
  });
});
