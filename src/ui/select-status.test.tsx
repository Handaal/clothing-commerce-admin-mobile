// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setLocale } from "../i18n";
import { formatDateTime } from "../i18n/format-date";
import { SELECT_INLINE_LIMIT, SelectField, StatusBadge } from "./components";
import { channelLabel, statusLabel, statusTone } from "./status";
import { t } from "../i18n";

afterEach(() => {
  cleanup();
  act(() => setLocale("en"));
});

const options = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    value: `p${index}`,
    label: `Product ${index}`,
  }));

describe("SelectField", () => {
  it("keeps short lists inline as radio options", () => {
    render(
      <SelectField
        label="Status"
        options={options(SELECT_INLINE_LIMIT)}
        selected="p1"
        onSelect={vi.fn()}
        testIDPrefix="status"
      />,
    );
    expect(screen.getByTestId("status-p0")).toBeTruthy();
    expect(screen.queryByTestId("status-trigger")).toBeNull();
  });

  it("collapses long lists into a field that opens a searchable sheet", () => {
    const onSelect = vi.fn();
    render(
      <SelectField
        label="Product"
        options={options(20)}
        selected="p3"
        onSelect={onSelect}
        testIDPrefix="product"
      />,
    );
    expect(screen.queryByTestId("product-p0")).toBeNull();
    expect(screen.getByTestId("product-trigger").textContent).toContain("Product 3");

    fireEvent.click(screen.getByTestId("product-trigger"));
    fireEvent.change(screen.getByTestId("product-search"), { target: { value: "product 12" } });
    expect(screen.queryByTestId("product-p0")).toBeNull();
    fireEvent.click(screen.getByTestId("product-p12"));

    expect(onSelect).toHaveBeenCalledWith("p12");
  });
});

describe("status and channel labels", () => {
  it("translates lifecycle codes and gives them a semantic tone", () => {
    expect(statusLabel("partially_fulfilled", t)).toBe("Partly fulfilled");
    expect(statusTone("partially_fulfilled")).toBe("warning");
    expect(statusTone("cancelled")).toBe("danger");
    expect(statusLabel("brand_new_state", t)).toBe("Brand new state");
    act(() => setLocale("ar"));
    expect(statusLabel("placed", t)).toBe("جديد");
    expect(channelLabel("online", t)).toBe("إلكتروني");
  });

  it("renders the localized label instead of the raw code", () => {
    render(<StatusBadge status="unfulfilled" testID="badge" />);
    expect(screen.getByTestId("badge").textContent).toBe("To fulfil");
  });
});

describe("formatDateTime", () => {
  it("follows the app language, keeps Latin digits, and passes malformed values through", () => {
    const value = "2026-11-20T12:05:00Z";
    const english = formatDateTime(value);
    expect(english).toMatch(/2026/);
    act(() => setLocale("ar"));
    const arabic = formatDateTime(value);
    expect(arabic).not.toBe(english);
    expect(arabic).toMatch(/2026/);
    expect(formatDateTime("not a date")).toBe("not a date");
  });
});
