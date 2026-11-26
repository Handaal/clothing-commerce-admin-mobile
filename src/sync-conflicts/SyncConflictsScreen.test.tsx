// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TENANT_A, meContext } from "../test-support/fixtures";
import type { PosSyncConflict } from "@shifted/clothing-commerce-sdk";

import { SyncConflictsScreen } from "./SyncConflictsScreen";

afterEach(cleanup);

const owner = () =>
  meContext(TENANT_A, { orders: { canRead: true, tenantWide: true, brands: [], branches: [] } });

const shortfall = {
  id: "c0000000-0000-4000-8000-000000000001",
  kind: "stock_shortfall" as const,
  reasonCode: "STOCK_SHORTFALL_AT_SYNC",
  status: "open" as const,
  branchId: null,
  inventoryLocationId: null,
  deviceId: null,
  registerId: "30000000-0000-4000-8000-000000000001",
  syncCommandId: "50000000-0000-4000-8000-000000000001",
  localReference: "local-sale-1",
  references: {
    orderId: "70000000-0000-4000-8000-000000000001",
    paymentId: null,
    customerId: null,
    promotionId: null,
    membershipId: null,
    variantId: "60000000-0000-4000-8000-000000000001",
  },
  quantity: 2,
  amountMinor: null,
  currency: "EGP",
  localEvidence: { sku: "TEE-BLK-M", requestedQuantity: 2, cachedOnHand: 2 },
  serverEvidence: { canonicalOnHandAtSync: 0 },
  localEventAt: "2026-11-15T08:00:00.000Z",
  detectedAt: "2026-11-15T09:00:01.000Z",
};

function report(items: PosSyncConflict[] = [shortfall]) {
  return {
    generatedAt: "2026-11-15T09:00:02.000Z",
    summary: { open: items.length, informational: 0 },
    items,
  };
}

describe("SyncConflictsScreen (ADR-042 §13.5)", () => {
  it("lists tenant-wide conflicts with the shortfall facts and a next step, and offers no approval action", async () => {
    const listPosSyncConflicts = vi.fn(async () => report());
    render(<SyncConflictsScreen client={{ listPosSyncConflicts }} context={owner()} />);
    expect(await screen.findByTestId("sync-conflict-card")).toBeTruthy();
    expect(listPosSyncConflicts).toHaveBeenCalledWith({ limit: 200 });
    const card = screen.getByTestId("sync-conflict-card");
    expect(card.textContent).toContain(
      "TEE-BLK-M: sold 2 · till estimate 2 · server had 0 · short 2",
    );
    expect(card.textContent).toContain("local-sale-1");
    expect(card.textContent).toMatch(/Stock \/ Orders/);
    expect(screen.queryByText(/approve|reject|override/i)).toBeNull();
  });

  it("shows an offline voucher conflict as a report: observed vs server usage, sale stands, no approve/reprice control", async () => {
    const voucher = {
      ...shortfall,
      id: "c0000000-0000-4000-8000-000000000002",
      kind: "voucher" as const,
      reasonCode: "VX_USAGE_EXHAUSTED",
      quantity: null,
      amountMinor: 259,
      references: {
        ...shortfall.references,
        variantId: null,
        promotionId: "80000000-0000-4000-8000-000000000001",
      },
      localEvidence: { observedRemaining: 1, discountTotalMinor: 259 },
      serverEvidence: {
        serverRemaining: 0,
        saleStandsAtPricePaid: true,
        redemptionRecorded: false,
      },
    };
    const listPosSyncConflicts = vi.fn(async () => report([voucher]));
    render(<SyncConflictsScreen client={{ listPosSyncConflicts }} context={owner()} />);
    const card = await screen.findByTestId("sync-conflict-card");
    expect(card.textContent).toContain("till last saw 1 left · server had 0 left at sync");
    expect(card.textContent).toContain("The sale stands at the price paid");
    expect(card.textContent).toContain("70000000-0000-4000-8000-000000000001");
    expect(screen.queryByText(/approve|reject|override|reprice|edit/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /approve|reprice|edit/i })).toBeNull();
  });

  it("filters by kind through the API", async () => {
    const listPosSyncConflicts = vi.fn(async () => report());
    render(<SyncConflictsScreen client={{ listPosSyncConflicts }} context={owner()} />);
    await screen.findByTestId("sync-conflict-card");
    fireEvent.click(screen.getByTestId("sync-conflicts-kind-customer_debt"));
    await vi.waitFor(() =>
      expect(listPosSyncConflicts).toHaveBeenLastCalledWith({ kind: "customer_debt", limit: 200 }),
    );
  });

  it("never calls the API without business-wide order access", () => {
    const listPosSyncConflicts = vi.fn();
    render(
      <SyncConflictsScreen
        client={{ listPosSyncConflicts }}
        context={meContext(TENANT_A, {
          orders: { canRead: true, tenantWide: false, brands: [], branches: [] },
        })}
      />,
    );
    expect(screen.getByText(/business-wide order access/)).toBeTruthy();
    expect(listPosSyncConflicts).not.toHaveBeenCalled();
  });

  it("shows an empty state when nothing conflicted", async () => {
    render(
      <SyncConflictsScreen
        client={{ listPosSyncConflicts: vi.fn(async () => report([])) }}
        context={owner()}
      />,
    );
    expect(await screen.findByText("No sync conflicts")).toBeTruthy();
  });
});
