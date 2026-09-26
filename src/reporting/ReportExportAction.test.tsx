// @vitest-environment jsdom
import { ApiContractError, ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReportExportAction, exportErrorMessage } from "./ReportExportAction";
import { fakeReportingAdapter } from "./test-fixtures";

afterEach(() => cleanup());

const request = {
  dataset: "sales-products",
  range: { preset: "custom", from: "2026-09-01", to: "2026-09-30" },
  level: "variant",
} as const;

const document = {
  body: "sku,value\r\n'=FORMULA,1\r\n",
  mediaType: "text/csv",
  filename: "sales-products_2026-09-01_2026-09-30.csv",
};

describe("ReportExportAction", () => {
  it("blocks duplicate taps and reports success only after the canonical document is saved", async () => {
    let resolveExport!: (value: typeof document) => void;
    const exportReport = vi.fn(
      () => new Promise<typeof document>((resolve) => (resolveExport = resolve)),
    );
    const save = vi.fn(async () => undefined);
    render(
      <ReportExportAction
        adapter={fakeReportingAdapter({ exportReport })}
        request={request}
        label="Export Variant sales CSV"
        save={save}
      />,
    );

    const button = screen.getByTestId("report-export-sales-products");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(exportReport).toHaveBeenCalledTimes(1);
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Exporting CSV…")).toBeTruthy();

    await act(async () => resolveExport(document));
    await waitFor(() => expect(save).toHaveBeenCalledWith(document));
    expect(screen.getByTestId("report-export-success").textContent).toContain(document.filename);
  });

  it("surfaces network failure without exposing a raw error", async () => {
    const exportReport = vi.fn(async () => {
      throw new ApiNetworkError("raw network failure");
    });
    render(
      <ReportExportAction
        adapter={fakeReportingAdapter({ exportReport })}
        request={request}
        label="Export CSV"
        save={vi.fn(async () => undefined)}
      />,
    );
    fireEvent.click(screen.getByTestId("report-export-sales-products"));
    expect((await screen.findByTestId("report-export-error")).textContent).toContain(
      "Check your connection",
    );
    expect(screen.queryByText(/raw network failure/)).toBeNull();
  });

  it("surfaces forbidden failure without exposing a backend code", async () => {
    const exportReport = vi.fn(async () => {
      throw new ApiHttpError("raw forbidden", 403, "REPORTS_FORBIDDEN", null);
    });
    render(
      <ReportExportAction
        adapter={fakeReportingAdapter({ exportReport })}
        request={request}
        label="Export CSV"
        save={vi.fn(async () => undefined)}
      />,
    );
    fireEvent.click(screen.getByTestId("report-export-sales-products"));
    expect((await screen.findByTestId("report-export-error")).textContent).toContain(
      "do not have access",
    );
    expect(screen.queryByText(/REPORTS_FORBIDDEN|raw forbidden/)).toBeNull();
  });
});

describe("export error UX", () => {
  it.each([
    [
      new ApiHttpError("raw", 422, "EXPORT_RANGE_TOO_LARGE", null),
      "selected date range is too large",
    ],
    [new ApiHttpError("raw", 413, "EXPORT_TOO_MANY_ROWS", null), "contains too many rows"],
    [new ApiHttpError("raw", 400, "INVALID_REPORT_EXPORT", null), "request is invalid"],
    [new ApiHttpError("raw", 401, "UNAUTHENTICATED", null), "session has expired"],
    [new ApiHttpError("raw", 500, "INTERNAL_ERROR", null), "could not create"],
    [new ApiContractError("raw"), "could not be validated"],
  ])("maps canonical failures to compact guidance", (error, expected) => {
    const message = exportErrorMessage(error);
    expect(message).toContain(expected);
    expect(message).not.toContain("EXPORT_");
  });
});
