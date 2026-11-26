// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { cssVarsDeclaration, darkColors, lightColors, colors } from "./theme";
import { getResolvedScheme, getThemeMode, setThemeMode, subscribe } from "./theme-store";

afterEach(() => {
  setThemeMode("system");
});

describe("theme tokens (web)", () => {
  it("resolves every color token to a CSS variable so all styles re-theme with no per-screen change", () => {
    // On web (react-native-web, as in these tests) tokens are var() refs with a light fallback.
    expect(colors.canvas).toBe("var(--c-canvas, #F5F1EA)");
    expect(colors.brand).toBe("var(--c-brand, #26413A)");
    expect(colors.onBrand).toBe("var(--c-onBrand, #FFFFFF)");
  });

  it("declares the same tokens for light and dark, with the correct values", () => {
    const light = cssVarsDeclaration(lightColors);
    const dark = cssVarsDeclaration(darkColors);
    expect(light).toContain("--c-canvas: #F5F1EA;");
    expect(dark).toContain("--c-canvas: #0E1210;");
    // Every light token must have a dark counterpart (a token can't be themed for only one mode).
    for (const token of Object.keys(lightColors)) {
      expect(dark).toContain(`--c-${token}:`);
    }
  });
});

describe("theme store", () => {
  it("applies an explicit dark preference to the document for instant CSS re-theming", () => {
    setThemeMode("dark");
    expect(getThemeMode()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(getResolvedScheme()).toBe("dark");
  });

  it("applies an explicit light preference", () => {
    setThemeMode("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(getResolvedScheme()).toBe("light");
  });

  it("clears the override for system mode so the OS preference (prefers-color-scheme) decides", () => {
    setThemeMode("dark");
    setThemeMode("system");
    expect(getThemeMode()).toBe("system");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("notifies subscribers when the preference changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setThemeMode("dark");
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
