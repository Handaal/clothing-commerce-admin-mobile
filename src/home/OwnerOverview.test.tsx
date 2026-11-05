// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "../i18n";
import { dashboardReport, fakeReportingAdapter } from "../reporting/test-fixtures";
import { OwnerOverview } from "./OwnerOverview";

beforeEach(() => setLocale("en"));
afterEach(() => cleanup());

describe("OwnerOverview", () => {
  it("shows one currency snapshot and keeps additional currencies separate", async () => {
    render(
      <OwnerOverview
        adapter={fakeReportingAdapter()}
        onOpenReports={() => undefined}
        onOpenProductsReport={() => undefined}
        onOpenReturnsReport={() => undefined}
      />,
    );

    expect(await screen.findByTestId("owner-net-sales")).toBeTruthy();
    expect(screen.getByTestId("owner-sales-trend")).toBeTruthy();
    expect(screen.getByText("+1 more currencies shown separately in Reports")).toBeTruthy();
    expect(screen.getByTestId("attention-no-sales")).toBeTruthy();
    expect(screen.getByTestId("attention-pending-refunds")).toBeTruthy();
  });

  it("opens the appropriate detailed report from each attention signal", async () => {
    const onOpenProductsReport = vi.fn();
    const onOpenReturnsReport = vi.fn();
    render(
      <OwnerOverview
        adapter={fakeReportingAdapter()}
        onOpenReports={() => undefined}
        onOpenProductsReport={onOpenProductsReport}
        onOpenReturnsReport={onOpenReturnsReport}
      />,
    );

    fireEvent.click(await screen.findByTestId("attention-no-sales"));
    fireEvent.click(screen.getByTestId("attention-pending-refunds"));
    expect(onOpenProductsReport).toHaveBeenCalledOnce();
    expect(onOpenReturnsReport).toHaveBeenCalledOnce();
  });

  it("does not fabricate sales metrics when the report has no currency groups", async () => {
    render(
      <OwnerOverview
        adapter={fakeReportingAdapter({
          getDashboard: async () => ({ ...dashboardReport(), currencies: [] }),
        })}
        onOpenReports={() => undefined}
        onOpenProductsReport={() => undefined}
        onOpenReturnsReport={() => undefined}
      />,
    );

    expect(await screen.findByText("No sales activity in this period")).toBeTruthy();
    expect(screen.queryByTestId("owner-net-sales")).toBeNull();
  });
});
