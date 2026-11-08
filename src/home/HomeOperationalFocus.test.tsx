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
});
