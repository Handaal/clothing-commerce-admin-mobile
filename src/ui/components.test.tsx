// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccordionTrigger, FilterChips, SearchField } from "./components";

afterEach(() => cleanup());

describe("shared UI controls", () => {
  it("makes search text easy to clear", () => {
    const onChangeText = vi.fn();
    render(
      <SearchField
        value="linen"
        onChangeText={onChangeText}
        placeholder="Search products"
        testID="catalog-search"
      />,
    );

    fireEvent.click(screen.getByTestId("catalog-search-clear"));
    expect(onChangeText).toHaveBeenCalledWith("");
  });

  it("exposes filter selection and reports the selected option", () => {
    const onSelect = vi.fn();
    render(
      <FilterChips
        options={[
          { value: "all", label: "All" },
          { value: "active", label: "Active" },
        ]}
        selected="all"
        onSelect={onSelect}
        testIDPrefix="status"
      />,
    );

    expect(screen.getByTestId("status-all").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByTestId("status-active"));
    expect(onSelect).toHaveBeenCalledWith("active");
  });

  it("gives expandable management sections an explicit accessibility state", () => {
    render(
      <AccordionTrigger
        title="Variants & prices"
        description="Manage SKUs and current selling prices."
        icon="tag-outline"
        expanded
        onPress={() => {}}
        testID="variants-section"
      />,
    );

    expect(screen.getByTestId("variants-section").getAttribute("aria-expanded")).toBe("true");
  });
});
