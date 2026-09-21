// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SUPPLIER_A,
  SUPPLIER_RECEIPT_A,
  fakeSupplierAdapter,
  supplierReceipt,
} from "../test-support/fixtures";
import { SupplierReceivingHistory } from "./SupplierReceivingHistory";

afterEach(() => cleanup());

function page(items = [supplierReceipt()]) {
  return { items, pageInfo: { nextCursor: null, hasMore: false } };
}

describe("SupplierReceivingHistory", () => {
  it("lists receipts with destination, reference and lines", async () => {
    const adapter = fakeSupplierAdapter({
      listSupplierReceipts: async () =>
        page([
          supplierReceipt({
            id: SUPPLIER_RECEIPT_A,
            locationName: "Flagship Stockroom",
            reference: "GRN-2026-0012",
          }),
        ]),
    });
    render(<SupplierReceivingHistory adapter={adapter} supplierId={SUPPLIER_A} />);
    expect(await screen.findByTestId(`supplier-receipt-${SUPPLIER_RECEIPT_A}`)).toBeTruthy();
    expect(screen.getByText("Flagship Stockroom")).toBeTruthy();
    expect(screen.getByText("GRN-2026-0012")).toBeTruthy();
  });

  it("shows an empty state when the supplier has no receipts", async () => {
    const adapter = fakeSupplierAdapter({ listSupplierReceipts: async () => page([]) });
    render(<SupplierReceivingHistory adapter={adapter} supplierId={SUPPLIER_A} />);
    expect(await screen.findByTestId("supplier-receipts-empty")).toBeTruthy();
  });

  it("surfaces a scope denial distinctly (does not fake an empty history)", async () => {
    const adapter = fakeSupplierAdapter({
      listSupplierReceipts: async () => {
        throw new ApiHttpError("no", 403, "FORBIDDEN", null);
      },
    });
    render(<SupplierReceivingHistory adapter={adapter} supplierId={SUPPLIER_A} />);
    expect(await screen.findByText(/do not have access/i)).toBeTruthy();
    expect(screen.queryByTestId("supplier-receipts-empty")).toBeNull();
  });

  it("offers a retry on a transient failure", async () => {
    const listSupplierReceipts = vi
      .fn()
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(page());
    const adapter = fakeSupplierAdapter({ listSupplierReceipts });
    render(<SupplierReceivingHistory adapter={adapter} supplierId={SUPPLIER_A} />);
    fireEvent.click(await screen.findByText("Try again"));
    expect(await screen.findByTestId(`supplier-receipt-${SUPPLIER_RECEIPT_A}`)).toBeTruthy();
  });
});
