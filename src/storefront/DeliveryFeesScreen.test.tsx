// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { buildDeliveryRequest, DeliveryFeesScreen, EGYPT_GOVERNORATES } from "./DeliveryFeesScreen";

const BRAND = "b0000000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listStorefrontSettings: vi.fn(),
  getReturnSettings: vi.fn(),
  listBrands: vi.fn(),
  getStorefrontDeliverySettings: vi.fn(),
  updateStorefrontDeliverySettings: vi.fn(),
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

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <DeliveryFeesScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => {}}
      generateIdempotencyKey={() => "key-1"}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  const base = meContext(TENANT_A);
  mocks.getContext.mockResolvedValue({
    ...base,
    access: { ...base.access, settings: { canRead: true, canManage: true } },
  });
  mocks.listStorefrontSettings.mockResolvedValue({
    items: [
      {
        tenantId: TENANT_A,
        brandId: BRAND,
        inventoryLocationId: "10000000-0000-4000-8000-000000000001",
        currency: "EGP",
        codEnabled: true,
      },
    ],
  });
  mocks.getReturnSettings.mockResolvedValue({
    tenantId: TENANT_A,
    enabled: false,
    windowDays: null,
    allowedReasons: [],
    manualRefundsEnabled: false,
    maxManualRefundMinor: null,
  });
  mocks.listBrands.mockResolvedValue({
    items: [{ id: BRAND, code: "zee", displayName: "Zee Store", status: "active" }],
    pageInfo: { nextCursor: null, hasMore: false },
  });
  mocks.getStorefrontDeliverySettings.mockResolvedValue({
    brandId: BRAND,
    currency: "EGP",
    freeDeliveryThresholdMinor: null,
    zones: [],
  });
});

afterEach(() => cleanup());

describe("buildDeliveryRequest", () => {
  it("converts amounts to minor units and treats empty fees as free", () => {
    expect(
      buildDeliveryRequest({
        threshold: "2000",
        zones: [
          { code: "EG-C", name: "Cairo", fee: "50", active: true },
          { code: "EG-GZ", name: "Giza", fee: "", active: false },
        ],
      }),
    ).toEqual({
      ok: true,
      value: {
        freeDeliveryThresholdMinor: 200000,
        zones: [
          { code: "EG-C", name: "Cairo", feeMinor: 5000, active: true },
          { code: "EG-GZ", name: "Giza", feeMinor: 0, active: false },
        ],
      },
    });
    expect(buildDeliveryRequest({ threshold: "", zones: [] })).toEqual({
      ok: true,
      value: { freeDeliveryThresholdMinor: null, zones: [] },
    });
    expect(
      buildDeliveryRequest({
        threshold: "",
        zones: [{ code: "EG-C", name: "Cairo", fee: "fifty", active: true }],
      }),
    ).toEqual({ ok: false, problem: "fee", zone: "Cairo" });
  });
});

describe("DeliveryFeesScreen", () => {
  it("fills Egypt's governorates, applies one fee and saves the whole list", async () => {
    mocks.updateStorefrontDeliverySettings.mockResolvedValue({
      brandId: BRAND,
      currency: "EGP",
      freeDeliveryThresholdMinor: 200000,
      zones: [],
    });
    render(
      <SessionProvider storage={createMemoryTenantStorage()}>
        <Harness />
      </SessionProvider>,
    );
    fireEvent.click(await screen.findByTestId("dlv-add-egypt"));
    expect(screen.getByTestId("dlv-zone-EG-C")).toBeTruthy();
    fireEvent.change(screen.getByTestId("dlv-all-fee"), { target: { value: "60" } });
    fireEvent.click(screen.getByTestId("dlv-apply-all"));
    fireEvent.change(screen.getByTestId("dlv-fee-EG-C"), { target: { value: "50" } });
    fireEvent.change(screen.getByTestId("dlv-threshold"), { target: { value: "2000" } });
    fireEvent.click(screen.getByTestId("dlv-save"));

    await waitFor(() => expect(mocks.updateStorefrontDeliverySettings).toHaveBeenCalledTimes(1));
    const request = mocks.updateStorefrontDeliverySettings.mock.calls[0]![0];
    expect(request).toMatchObject({
      brandId: BRAND,
      idempotencyKey: "key-1",
      freeDeliveryThresholdMinor: 200000,
    });
    expect(request.zones).toHaveLength(EGYPT_GOVERNORATES.length);
    expect(request.zones[0]).toEqual({ code: "EG-C", name: "Cairo", feeMinor: 5000, active: true });
    expect(request.zones[1]).toEqual({ code: "EG-GZ", name: "Giza", feeMinor: 6000, active: true });
  });
});
