// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportsDashboardScreen } from "./ReportsDashboardScreen";
import { dashboardReport, fakeReportingAdapter } from "./test-fixtures";

afterEach(() => cleanup());

describe("ReportsDashboardScreen", () => {
  it("renders timezone, sales cards, separate returns, trend, channel, brand, Products and inventory", async () => {
    render(
      <ReportsDashboardScreen
        adapter={fakeReportingAdapter()}
        canRead
        onOpen={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(await screen.findByText("Africa/Cairo")).toBeTruthy();
    expect(screen.getAllByText("Gross").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AOV").length).toBe(2);
    expect(screen.getAllByText("Returns and refunds â€” separate from sales").length).toBe(2);
    expect(screen.getAllByText("POS vs Online").length).toBe(2);
    expect(screen.getAllByText("Brand breakdown").length).toBe(2);
    expect(screen.getAllByText("Linen Shirt").length).toBe(2);
    expect(screen.getByText("Current stock summary")).toBeTruthy();
    expect(screen.getByText("No sales in period with current stock")).toBeTruthy();
  });

  it("keeps multiple currencies separate and requires an explicit selector choice", async () => {
    render(
      <ReportsDashboardScreen
        adapter={fakeReportingAdapter()}
        canRead
        onOpen={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(await screen.findByTestId("currency-group-USD")).toBeTruthy();
    expect(screen.getByTestId("currency-group-EUR")).toBeTruthy();
    expect(screen.getByText("All currencies (shown separately)")).toBeTruthy();
    fireEvent.click(screen.getByTestId("report-currency-EUR"));
    expect(screen.queryByTestId("currency-group-USD")).toBeNull();
    expect(screen.getByTestId("currency-group-EUR")).toBeTruthy();
  });

  it("changes date presets and validates a custom range before loading it", async () => {
    const getDashboard = vi.fn(async () => dashboardReport());
    render(
      <ReportsDashboardScreen
        adapter={fakeReportingAdapter({ getDashboard })}
        canRead
        onOpen={() => undefined}
        onBack={() => undefined}
      />,
    );
    await screen.findByText("Africa/Cairo");
    fireEvent.click(screen.getByTestId("report-date-preset-7-days"));
    await waitFor(() =>
      expect(getDashboard).toHaveBeenLastCalledWith({ range: { preset: "7-days" } }),
    );
    fireEvent.click(screen.getByTestId("report-date-preset-custom"));
    fireEvent.change(screen.getByTestId("report-date-from"), { target: { value: "2026-09-20" } });
    fireEvent.change(screen.getByTestId("report-date-to"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByText("Apply custom range"));
    expect(screen.getByTestId("report-date-error").textContent).toContain("Start date");
  });

  it("renders empty, concise error, access-denied and pending-transport states", async () => {
    const { rerender } = render(
      <ReportsDashboardScreen
        adapter={fakeReportingAdapter({
          getDashboard: async () => ({
            ...dashboardReport(),
            currencies: [],
            topProducts: [],
            noSalesWithCurrentStock: [],
          }),
        })}
        canRead
        onOpen={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(await screen.findByTestId("report-empty")).toBeTruthy();
    rerender(
      <ReportsDashboardScreen
        adapter={fakeReportingAdapter({
          getDashboard: async () => {
            throw new TypeError("BACKEND_SECRET_CODE");
          },
        })}
        canRead
        onOpen={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(await screen.findByTestId("report-error")).toBeTruthy();
    expect(screen.queryByText("BACKEND_SECRET_CODE")).toBeNull();
    rerender(
      <ReportsDashboardScreen
        adapter={null}
        canRead={false}
        onOpen={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByTestId("reporting-access-denied")).toBeTruthy();
    rerender(
      <ReportsDashboardScreen
        adapter={null}
        canRead
        onOpen={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByTestId("reporting-transport-pending")).toBeTruthy();
  });

  it("maps server forbidden and validation failures without exposing backend codes", async () => {
    const { rerender } = render(
      <ReportsDashboardScreen
        adapter={fakeReportingAdapter({
          getDashboard: async () => {
            throw new ApiHttpError("raw forbidden", 403, "FORBIDDEN", null);
          },
        })}
        canRead
        onOpen={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.getByText("You do not have access to this report.")).toBeTruthy();
    expect(screen.queryByText(/raw forbidden|FORBIDDEN/)).toBeNull();

    rerender(
      <ReportsDashboardScreen
        adapter={fakeReportingAdapter({
          getDashboard: async () => {
            throw new ApiHttpError("raw cursor", 422, "INVALID_REPORT_QUERY", null);
          },
        })}
        canRead
        onOpen={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(await screen.findByText("Invalid request")).toBeTruthy();
    expect(
      screen.getByText("Check the date range or page selection, then try again."),
    ).toBeTruthy();
    expect(screen.queryByText(/raw cursor|INVALID_REPORT_QUERY/)).toBeNull();
  });

  it("navigates to all six detail reports and has no dashboard export", async () => {
    const onOpen = vi.fn();
    render(
      <ReportsDashboardScreen
        adapter={fakeReportingAdapter()}
        canRead
        onOpen={onOpen}
        onBack={() => undefined}
      />,
    );
    await screen.findByText("Africa/Cairo");
    for (const report of [
      "sales",
      "products",
      "inventory",
      "returns",
      "promotions",
      "suppliers",
    ] as const) {
      fireEvent.click(screen.getByTestId(`open-report-${report}`));
      expect(onOpen).toHaveBeenLastCalledWith(report);
    }
    expect(screen.queryByTestId("report-export-reserved")).toBeNull();
  });
});
