// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "../i18n";
import {
  ORDER_A,
  SUPPLIER_A,
  fakeSupplierAdapter,
  inventoryItem,
  inventoryList,
  orderList,
  orderListItem,
  supplierDue,
} from "../test-support/fixtures";
import { HomeOperationalFocus } from "./HomeOperationalFocus";

beforeEach(() => setLocale("en"));
afterEach(() => cleanup());

function clientWithSignals() {
  return {
    listOrders: vi.fn(async () => orderList([orderListItem()])),
    listInventory: vi.fn(async () =>
      inventoryList([
        inventoryItem({ onHand: 2 }),
        inventoryItem({
          variantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          sku: "LS-001-L",
          onHand: 18,
        }),
      ]),
    ),
  } as unknown as TenantCommerceClient;
}

function renderFocus(overrides?: {
  client?: TenantCommerceClient;
  canReadOrders?: boolean;
  canReadInventory?: boolean;
  onOpenOrder?: (id: string) => void;
  onOpenSupplier?: (id: string) => void;
}) {
  const client = overrides?.client ?? clientWithSignals();
  return {
    client,
    ...render(
      <HomeOperationalFocus
        client={client}
        canReadOrders={overrides?.canReadOrders ?? true}
        canReadInventory={overrides?.canReadInventory ?? true}
        supplierAdapter={fakeSupplierAdapter({
          supplierDues: async () => [supplierDue()],
        })}
        onOpenOrder={overrides?.onOpenOrder ?? (() => undefined)}
        onOpenOrders={() => undefined}
        onOpenInventory={() => undefined}
        onOpenSupplier={overrides?.onOpenSupplier ?? (() => undefined)}
        onOpenSuppliers={() => undefined}
      />,
    ),
  };
}

describe("HomeOperationalFocus", () => {
  it("shows compact placed-order, low-stock and supplier-due signals from canonical reads", async () => {
    const { client } = renderFocus();

    expect(await screen.findByTestId(`home-order-${ORDER_A}`)).toBeTruthy();
    expect(screen.getByText("2 on hand")).toBeTruthy();
    expect(screen.getByTestId(`home-supplier-due-${SUPPLIER_A}`)).toBeTruthy();
    expect(client.listOrders).toHaveBeenCalledWith({ status: "placed", limit: 3 });
    expect(screen.getByText(/display cue, not an availability or reorder rule/)).toBeTruthy();
  });

  it("routes an order and supplier row to their real identifiers", async () => {
    const onOpenOrder = vi.fn();
    const onOpenSupplier = vi.fn();
    renderFocus({ onOpenOrder, onOpenSupplier });

    fireEvent.click(await screen.findByTestId(`home-order-${ORDER_A}`));
    fireEvent.click(screen.getByTestId(`home-supplier-due-${SUPPLIER_A}`));
    expect(onOpenOrder).toHaveBeenCalledWith(ORDER_A);
    expect(onOpenSupplier).toHaveBeenCalledWith(SUPPLIER_A);
  });

  it("does not call an API domain when the context did not grant read guidance", async () => {
    const client = clientWithSignals();
    renderFocus({ client, canReadOrders: false, canReadInventory: false });

    expect(await screen.findByText("Supplier dues")).toBeTruthy();
    expect(client.listOrders).not.toHaveBeenCalled();
    expect(client.listInventory).not.toHaveBeenCalled();
  });

  it("leads with website orders still to ship, oldest first, when the list carries ship status", async () => {
    const newest = orderListItem({
      id: "c1111111-1111-4111-8111-111111111111",
      orderNumber: "W-3",
      channel: "online",
      fulfillmentStatus: "unfulfilled",
      customerName: "Omar Hassan",
      deliveryCity: "Dokki",
    } as never);
    const shipped = orderListItem({
      id: "c2222222-2222-4222-8222-222222222222",
      orderNumber: "W-2",
      channel: "online",
      fulfillmentStatus: "fulfilled",
    } as never);
    const oldest = orderListItem({
      id: "c3333333-3333-4333-8333-333333333333",
      orderNumber: "W-1",
      channel: "online",
      fulfillmentStatus: "partially_fulfilled",
    } as never);
    const client = {
      ...clientWithSignals(),
      listOrders: vi.fn(async () => orderList([newest, shipped, oldest])),
    } as unknown as TenantCommerceClient;
    renderFocus({ client });

    expect(await screen.findByText("Website orders to ship (2)")).toBeTruthy();
    const rows = screen
      .getAllByTestId(/^home-order-/u)
      .map((row) => row.getAttribute("data-testid"));
    expect(rows).toEqual([`home-order-${oldest.id}`, `home-order-${newest.id}`]);
    expect(screen.getByText(/Omar Hassan · Dokki/u)).toBeTruthy();
  });
});
