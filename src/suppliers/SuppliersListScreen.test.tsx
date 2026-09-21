// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SUPPLIER_A,
  SUPPLIER_B,
  fakeSupplierAdapter,
  supplierSummary,
} from "../test-support/fixtures";
import { SuppliersListScreen } from "./SuppliersListScreen";

afterEach(() => cleanup());

function page(items = [supplierSummary()], pageInfo = {}) {
  return { items, pageInfo: { nextCursor: null, hasMore: false, ...pageInfo } };
}

const noop = () => {};

describe("SuppliersListScreen", () => {
  it("renders an explicit unavailable state (no fake rows) when there is no adapter", () => {
    render(
      <SuppliersListScreen
        adapter={null}
        canManage
        onOpenSupplier={noop}
        onCreateSupplier={noop}
        onBack={noop}
      />,
    );
    expect(screen.getByTestId("supplier-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("supplier-search-submit")).toBeNull();
    expect(screen.queryByTestId(`supplier-row-${SUPPLIER_A}`)).toBeNull();
  });

  it("shows a loading state while suppliers are fetched", async () => {
    const adapter = fakeSupplierAdapter({ listSuppliers: () => new Promise(() => {}) });
    render(
      <SuppliersListScreen
        adapter={adapter}
        canManage
        onOpenSupplier={noop}
        onCreateSupplier={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByText("Loading suppliers…")).toBeTruthy();
  });

  it("renders a populated list with an active/inactive status badge per row", async () => {
    const adapter = fakeSupplierAdapter({
      listSuppliers: async () =>
        page([
          supplierSummary({ id: SUPPLIER_A, name: "Nile Textiles", status: "active" }),
          supplierSummary({ id: SUPPLIER_B, name: "Delta Fabrics", status: "inactive" }),
        ]),
    });
    render(
      <SuppliersListScreen
        adapter={adapter}
        canManage
        onOpenSupplier={noop}
        onCreateSupplier={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByText("Nile Textiles")).toBeTruthy();
    expect(screen.getByTestId(`supplier-status-${SUPPLIER_A}`).textContent).toBe("Active");
    expect(screen.getByTestId(`supplier-status-${SUPPLIER_B}`).textContent).toBe("Inactive");
    // Inactive suppliers remain listed — retained history, never hidden as if deleted.
    expect(screen.getByText("Delta Fabrics")).toBeTruthy();
  });

  it("shows an empty state (not an error) when there are zero suppliers", async () => {
    const adapter = fakeSupplierAdapter({ listSuppliers: async () => page([]) });
    render(
      <SuppliersListScreen
        adapter={adapter}
        canManage
        onOpenSupplier={noop}
        onCreateSupplier={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByText(/No suppliers yet/)).toBeTruthy();
  });

  it("submits search as a server query (never a client-side filter)", async () => {
    const listSuppliers = vi.fn().mockResolvedValue(page([supplierSummary()]));
    const adapter = fakeSupplierAdapter({ listSuppliers });
    render(
      <SuppliersListScreen
        adapter={adapter}
        canManage
        onOpenSupplier={noop}
        onCreateSupplier={noop}
        onBack={noop}
      />,
    );
    await screen.findByText("Nile Textiles Co.");
    // First load runs the unconstrained query.
    expect(listSuppliers).toHaveBeenLastCalledWith({});

    fireEvent.change(screen.getByTestId("supplier-search-term"), { target: { value: "nile" } });
    fireEvent.click(screen.getByTestId("supplier-status-filter-inactive"));
    fireEvent.click(screen.getByTestId("supplier-search-submit"));

    await waitFor(() =>
      expect(listSuppliers).toHaveBeenLastCalledWith({ search: "nile", status: "inactive" }),
    );
  });

  it("shows a filtered-empty message distinct from the no-suppliers-at-all message", async () => {
    const adapter = fakeSupplierAdapter({ listSuppliers: async () => page([]) });
    render(
      <SuppliersListScreen
        adapter={adapter}
        canManage
        onOpenSupplier={noop}
        onCreateSupplier={noop}
        onBack={noop}
      />,
    );
    await screen.findByText(/No suppliers yet/);
    fireEvent.change(screen.getByTestId("supplier-search-term"), { target: { value: "zzz" } });
    fireEvent.click(screen.getByTestId("supplier-search-submit"));
    expect(await screen.findByText(/No suppliers match your search/)).toBeTruthy();
  });

  it("surfaces a classified network error with a retry", async () => {
    const listSuppliers = vi
      .fn()
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(page([supplierSummary()]));
    const adapter = fakeSupplierAdapter({ listSuppliers });
    render(
      <SuppliersListScreen
        adapter={adapter}
        canManage
        onOpenSupplier={noop}
        onCreateSupplier={noop}
        onBack={noop}
      />,
    );
    fireEvent.click(await screen.findByText("Try again"));
    expect(await screen.findByText("Nile Textiles Co.")).toBeTruthy();
  });

  it("does NOT turn a 403 into an empty list — it shows access denied without retry", async () => {
    const adapter = fakeSupplierAdapter({
      listSuppliers: async () => {
        throw new ApiHttpError("no", 403, "FORBIDDEN", null);
      },
    });
    render(
      <SuppliersListScreen
        adapter={adapter}
        canManage
        onOpenSupplier={noop}
        onCreateSupplier={noop}
        onBack={noop}
      />,
    );
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText(/No suppliers/)).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("navigates when a row is tapped and offers a create affordance", async () => {
    const onOpenSupplier = vi.fn();
    const onCreateSupplier = vi.fn();
    const adapter = fakeSupplierAdapter({
      listSuppliers: async () => page([supplierSummary({ id: SUPPLIER_A })]),
    });
    render(
      <SuppliersListScreen
        adapter={adapter}
        canManage
        onOpenSupplier={onOpenSupplier}
        onCreateSupplier={onCreateSupplier}
        onBack={noop}
      />,
    );
    fireEvent.click(await screen.findByTestId(`supplier-row-${SUPPLIER_A}`));
    expect(onOpenSupplier).toHaveBeenCalledWith(SUPPLIER_A);

    fireEvent.click(screen.getByTestId("create-supplier"));
    expect(onCreateSupplier).toHaveBeenCalledTimes(1);
  });

  it("hides the create affordance when the caller cannot manage suppliers", async () => {
    const adapter = fakeSupplierAdapter({
      listSuppliers: async () => page([supplierSummary({ id: SUPPLIER_A })]),
    });
    render(
      <SuppliersListScreen
        adapter={adapter}
        canManage={false}
        onOpenSupplier={noop}
        onCreateSupplier={noop}
        onBack={noop}
      />,
    );
    // The read surface still works (rows load); only the create affordance is withheld.
    await screen.findByTestId(`supplier-row-${SUPPLIER_A}`);
    expect(screen.queryByTestId("create-supplier")).toBeNull();
  });
});
