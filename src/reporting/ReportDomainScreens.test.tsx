// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  InventoryReportScreen,
  ProductsReportScreen,
  PromotionsReportScreen,
  ReturnsReportScreen,
  SalesReportScreen,
  SuppliersReportScreen,
} from "./ReportDomainScreens";
import { fakeReportingAdapter } from "./test-fixtures";

afterEach(() => cleanup());
const back = () => undefined;

describe("reporting domain screens", () => {
  it("offers every sales view and uses POS-only branch wording", async () => {
    render(<SalesReportScreen adapter={fakeReportingAdapter()} canRead onBack={back} />);
    await screen.findByText("Sales trend");
    fireEvent.click(screen.getByTestId("sales-view-pos_branch"));
    expect(await screen.findByText("POS sales by branch")).toBeTruthy();
    expect(screen.getByText("Online sales are not assigned to a Branch.")).toBeTruthy();
    expect(screen.queryByText("Sales by branch")).toBeNull();
    expect(screen.getByTestId("sales-view-channel")).toBeTruthy();
    expect(screen.getByTestId("sales-view-brand")).toBeTruthy();
    expect(screen.getByTestId("sales-view-pos_register")).toBeTruthy();
    expect(screen.getByTestId("sales-view-pos_operator")).toBeTruthy();
  });

  it("exports canonical Product and Variant sales while preserving bounded JSON paging", async () => {
    const getProductSales = vi.fn(fakeReportingAdapter().getProductSales);
    const exportReport = vi.fn(fakeReportingAdapter().exportReport);
    const saveExport = vi.fn(async () => undefined);
    render(
      <ProductsReportScreen
        adapter={fakeReportingAdapter({ getProductSales, exportReport })}
        canRead
        onBack={back}
        saveExport={saveExport}
      />,
    );
    await screen.findByText("Linen Shirt");
    expect(screen.getAllByText("Product ranking").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId("report-export-sales-products"));
    await waitFor(() =>
      expect(exportReport).toHaveBeenLastCalledWith({
        dataset: "sales-products",
        range: { preset: "today" },
        level: "product",
      }),
    );
    expect(await screen.findByTestId("report-export-success")).toBeTruthy();

    fireEvent.click(screen.getByTestId("product-ranking-variant"));
    fireEvent.click(screen.getByTestId("report-export-sales-products"));
    await waitFor(() =>
      expect(exportReport).toHaveBeenLastCalledWith({
        dataset: "sales-products",
        range: { preset: "today" },
        level: "variant",
      }),
    );

    fireEvent.click(screen.getByTestId("product-view-no_sales_with_current_stock"));
    expect(await screen.findByText("No sales in period with current stock")).toBeTruthy();
    expect((await screen.findAllByText("Variant ranking")).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("report-export-sales-products")).toBeNull();
    fireEvent.click(screen.getByText("Next page"));
    await waitFor(() =>
      expect(getProductSales).toHaveBeenLastCalledWith(
        { range: { preset: "today" }, cursor: "page-2" },
        "variant",
        "no_sales_with_current_stock",
      ),
    );
    expect(screen.getByTestId("report-pagination")).toBeTruthy();
  });

  it("exports only Inventory movements and never the current balance snapshot", async () => {
    const exportReport = vi.fn(fakeReportingAdapter().exportReport);
    const saveExport = vi.fn(async () => undefined);
    render(
      <InventoryReportScreen
        adapter={fakeReportingAdapter({ exportReport })}
        canRead
        onBack={back}
        saveExport={saveExport}
      />,
    );
    expect(await screen.findByText(/InventoryLocation is the stock-holding identity/)).toBeTruthy();
    expect(screen.getAllByText("InventoryLocation").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("report-export-inventory-movements")).toBeNull();
    fireEvent.click(screen.getByTestId("inventory-view-movements"));
    expect(await screen.findByText("Inventory movements")).toBeTruthy();
    fireEvent.click(screen.getByTestId("report-export-inventory-movements"));
    await waitFor(() =>
      expect(exportReport).toHaveBeenLastCalledWith({
        dataset: "inventory-movements",
        range: { preset: "today" },
      }),
    );
    for (const view of ["receipts", "transfers", "adjustments"] as const) {
      fireEvent.click(screen.getByTestId(`inventory-view-${view}`));
      expect(
        (
          await screen.findAllByText(
            view === "receipts" ? "Receipts" : view === "transfers" ? "Transfers" : "Adjustments",
          )
        ).length,
      ).toBeGreaterThan(0);
    }
    expect(screen.queryByTestId("report-export-inventory-movements")).toBeNull();
    expect(screen.queryByText(/low stock/i)).toBeNull();
  });

  it("exports canonical Returns/refunds without changing the JSON semantics", async () => {
    const exportReport = vi.fn(fakeReportingAdapter().exportReport);
    render(
      <ReturnsReportScreen
        adapter={fakeReportingAdapter({ exportReport })}
        canRead
        onBack={back}
        saveExport={vi.fn(async () => undefined)}
      />,
    );
    expect(await screen.findByText("Accepted returned value")).toBeTruthy();
    expect(screen.getByText("Succeeded refunded value")).toBeTruthy();
    expect(screen.getByText("Pending refunds")).toBeTruthy();
    expect(screen.getByText("Disposition")).toBeTruthy();
    expect(screen.queryByText(/return rate/i)).toBeNull();
    expect(screen.getByTestId("report-pagination")).toBeTruthy();
    fireEvent.click(screen.getByTestId("report-export-returns"));
    await waitFor(() =>
      expect(exportReport).toHaveBeenCalledWith({
        dataset: "returns",
        range: { preset: "today" },
      }),
    );
  });

  it("shows Promotion reporting economics by currency without ROI or export", async () => {
    render(<PromotionsReportScreen adapter={fakeReportingAdapter()} canRead onBack={back} />);
    expect(await screen.findByText("Autumn offer")).toBeTruthy();
    expect(screen.getByText("Redemptions")).toBeTruthy();
    expect(screen.getByText("Discount amount")).toBeTruthy();
    expect(screen.getByText("Associated Orders")).toBeTruthy();
    expect(screen.getByText("Gross sales")).toBeTruthy();
    expect(screen.getByText("Net sales")).toBeTruthy();
    expect(screen.getByText("Cancelled Orders")).toBeTruthy();
    expect(screen.queryByText(/ROI|profitability/i)).toBeNull();
    expect(screen.queryByTestId(/^report-export-/)).toBeNull();
  });

  it("exports Supplier receipt history without spend or value", async () => {
    const exportReport = vi.fn(fakeReportingAdapter().exportReport);
    render(
      <SuppliersReportScreen
        adapter={fakeReportingAdapter({ exportReport })}
        canRead
        onBack={back}
        saveExport={vi.fn(async () => undefined)}
      />,
    );
    expect(await screen.findByText("Nile Textiles")).toBeTruthy();
    expect(screen.getByText("Receipt count")).toBeTruthy();
    expect(screen.getByText("Units received")).toBeTruthy();
    expect(screen.getByText("Last receipt")).toBeTruthy();
    expect(screen.queryByText(/spend|supplier value/i)).toBeNull();
    fireEvent.click(screen.getByTestId("report-export-supplier-receipts"));
    await waitFor(() =>
      expect(exportReport).toHaveBeenCalledWith({
        dataset: "supplier-receipts",
        range: { preset: "today" },
      }),
    );
  });
});
