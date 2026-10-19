// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccordionTrigger, Badge, FilterChips, SearchField } from "./components";

afterEach(() => cleanup());

// The tone classes are hashed by react-native-web, so assert equivalence against a reference label
// of a known tone rather than a literal class name.
function toneClass(label: string): string {
  cleanup();
  render(<Badge label={label} testID="badge" />);
  return screen.getByTestId("badge").className;
}

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

  it("auto-tones a captured payment as success and an authorized one as a warning", () => {
    const success = toneClass("active");
    const warning = toneClass("pending");
    const neutral = toneClass("totally-unknown-status");

    // A captured payment is a success, not a neutral grey pill (the pre-fix behavior).
    expect(toneClass("captured")).toBe(success);
    expect(toneClass("captured")).not.toBe(neutral);
    // An authorized-but-not-captured payment is provisional → warning.
    expect(toneClass("authorized")).toBe(warning);
    // The removed stray "in" entry must no longer read as success.
    expect(toneClass("in")).toBe(neutral);
  });
});
