// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import {
  SUPPLIER_A,
  fakeSupplierAdapter,
  supplier,
  supplierReceipt,
} from "../test-support/fixtures";
import { SupplierDetailScreen } from "./SupplierDetailScreen";

afterEach(() => cleanup());

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

const noop = () => {};

function receiptPage(items = [supplierReceipt()]) {
  return { items, pageInfo: { nextCursor: null, hasMore: false } };
}

describe("SupplierDetailScreen", () => {
  it("renders the unavailable state (no fabricated supplier) when there is no adapter", () => {
    render(
      <SupplierDetailScreen adapter={null} supplierId={SUPPLIER_A} onBack={noop} onEdit={noop} />,
    );
    expect(screen.getByTestId("supplier-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("supplier-detail-status")).toBeNull();
  });

  it("shows the supplier record, status and an edit affordance", async () => {
    const adapter = fakeSupplierAdapter({
      getSupplier: async () =>
        supplier({ id: SUPPLIER_A, name: "Nile Textiles", status: "active" }),
      listSupplierReceipts: async () => receiptPage(),
    });
    const onEdit = vi.fn();
    render(
      <SupplierDetailScreen
        adapter={adapter}
        supplierId={SUPPLIER_A}
        onBack={noop}
        onEdit={onEdit}
      />,
    );
    expect(await screen.findByText("Nile Textiles")).toBeTruthy();
    expect(screen.getByTestId("supplier-detail-status").textContent).toBe("Active");

    fireEvent.click(screen.getByTestId("supplier-edit"));
    expect(onEdit).toHaveBeenCalledWith(SUPPLIER_A);
  });

  it("presents inactive as retained, not deleted", async () => {
    const adapter = fakeSupplierAdapter({
      getSupplier: async () => supplier({ id: SUPPLIER_A, status: "inactive" }),
      listSupplierReceipts: async () => receiptPage([]),
    });
    render(
      <SupplierDetailScreen
        adapter={adapter}
        supplierId={SUPPLIER_A}
        onBack={noop}
        onEdit={noop}
      />,
    );
    expect(await screen.findByText(/not deleted/i)).toBeTruthy();
  });

  it("changes status through the adapter (confirmed) and re-reads the supplier", async () => {
    const getSupplier = vi
      .fn()
      .mockResolvedValueOnce(supplier({ id: SUPPLIER_A, status: "active" }))
      .mockResolvedValueOnce(supplier({ id: SUPPLIER_A, status: "inactive" }));
    const setSupplierStatus = vi
      .fn()
      .mockResolvedValue(supplier({ id: SUPPLIER_A, status: "inactive" }));
    const adapter = fakeSupplierAdapter({
      getSupplier,
      setSupplierStatus,
      listSupplierReceipts: async () => receiptPage([]),
    });
    render(
      <SupplierDetailScreen
        adapter={adapter}
        supplierId={SUPPLIER_A}
        onBack={noop}
        onEdit={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    await screen.findByTestId("supplier-detail-status");
    // ConfirmButton is two-step: first press arms, second confirms.
    fireEvent.click(screen.getByTestId("supplier-status-toggle"));
    fireEvent.click(screen.getByTestId("supplier-status-toggle"));

    await waitFor(() =>
      expect(setSupplierStatus).toHaveBeenCalledWith(SUPPLIER_A, "inactive", "K1"),
    );
    // The authoritative supplier is re-read after the change (status now inactive).
    await waitFor(() => expect(getSupplier).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/not deleted/i)).toBeTruthy();
  });

  it("keeps the status change out of a delete — no permanent-delete control exists", async () => {
    const adapter = fakeSupplierAdapter({
      getSupplier: async () => supplier({ id: SUPPLIER_A }),
      listSupplierReceipts: async () => receiptPage([]),
    });
    render(
      <SupplierDetailScreen
        adapter={adapter}
        supplierId={SUPPLIER_A}
        onBack={noop}
        onEdit={noop}
      />,
    );
    await screen.findByTestId("supplier-detail-status");
    expect(screen.queryByText(/^delete$/i)).toBeNull();
    expect(screen.queryByText(/permanently/i)).toBeNull();
  });

  it("surfaces a load error", async () => {
    const adapter = fakeSupplierAdapter({
      getSupplier: async () => {
        throw new ApiHttpError("no", 404, "NOT_FOUND", null);
      },
    });
    render(
      <SupplierDetailScreen
        adapter={adapter}
        supplierId={SUPPLIER_A}
        onBack={noop}
        onEdit={noop}
      />,
    );
    expect(await screen.findByText("Not found")).toBeTruthy();
  });
});
