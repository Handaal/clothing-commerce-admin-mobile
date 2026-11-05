// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INVENTORY_LOCATION_A,
  SUPPLIER_A,
  VARIANT_A,
  fakeSupplierAdapter,
  supplierDue,
  supplierPayment,
  supplierReminder,
} from "../test-support/fixtures";
import type { SelectOption } from "../ui/components";
import { SupplierLedger } from "./SupplierLedger";

function renderLedger(overrides: Parameters<typeof fakeSupplierAdapter>[0] = {}, canManage = true) {
  const adapter = fakeSupplierAdapter(overrides);
  const locationOptions: SelectOption[] = [{ value: INVENTORY_LOCATION_A, label: "Main" }];
  const loadVariants = vi.fn(async () => [{ value: VARIANT_A, label: "Linen Shirt · LS-001-M" }]);
  render(
    <SupplierLedger
      adapter={adapter}
      supplierId={SUPPLIER_A}
      canManage={canManage}
      locationOptions={locationOptions}
      loadVariants={loadVariants}
      generateKey={() => "fixed-key"}
    />,
  );
  return { adapter };
}

afterEach(() => cleanup());

describe("SupplierLedger", () => {
  it("renders the supplier's outstanding balance from the dues list", async () => {
    renderLedger({ supplierDues: async () => [supplierDue({ outstandingMinor: 30000 })] });
    expect(await screen.findByTestId("supplier-outstanding")).toBeTruthy();
    expect(screen.getByTestId("supplier-outstanding").textContent).toContain("300");
  });

  it("records a payment through the adapter", async () => {
    const recordSupplierPayment = vi.fn(async () => supplierPayment());
    renderLedger({ recordSupplierPayment });
    fireEvent.change(await screen.findByTestId("supplier-payment-amount"), {
      target: { value: "100" },
    });
    fireEvent.click(screen.getByTestId("supplier-payment-submit"));
    await waitFor(() => expect(recordSupplierPayment).toHaveBeenCalledTimes(1));
    expect(recordSupplierPayment).toHaveBeenCalledWith(SUPPLIER_A, { amountMinor: 10000 }, "fixed-key");
  });

  it("adds a reminder through the adapter", async () => {
    const createSupplierReminder = vi.fn(async () => supplierReminder());
    renderLedger({ createSupplierReminder });
    fireEvent.change(await screen.findByTestId("supplier-reminder-due"), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(screen.getByTestId("supplier-reminder-submit"));
    await waitFor(() => expect(createSupplierReminder).toHaveBeenCalledTimes(1));
    expect(createSupplierReminder).toHaveBeenCalledWith(
      { supplierId: SUPPLIER_A, dueDate: "2026-10-01" },
      "fixed-key",
    );
  });

  it("marks a pending reminder done through the adapter", async () => {
    const updateSupplierReminder = vi.fn(async () => supplierReminder({ status: "done" }));
    renderLedger({
      listSupplierReminders: async () => [supplierReminder({ status: "pending" })],
      updateSupplierReminder,
    });
    const doneBtn = await screen.findByTestId(/supplier-reminder-done-/);
    fireEvent.click(doneBtn);
    await waitFor(() => expect(updateSupplierReminder).toHaveBeenCalledTimes(1));
    expect(updateSupplierReminder).toHaveBeenCalledWith(
      expect.any(String),
      { status: "done" },
      expect.any(String),
    );
  });

  it("hides every write form when the caller cannot manage", async () => {
    renderLedger({}, false);
    // Balance still loads, but no record/add controls are present.
    await screen.findByTestId("supplier-outstanding");
    expect(screen.queryByTestId("supplier-record-purchase-open")).toBeNull();
    expect(screen.queryByTestId("supplier-record-payment-form")).toBeNull();
    expect(screen.queryByTestId("supplier-add-reminder-form")).toBeNull();
  });
});
