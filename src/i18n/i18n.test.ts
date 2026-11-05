import { afterEach, describe, expect, it } from "vitest";

import { ar, en, type MessageKey } from "./catalog";
import { DEFAULT_LOCALE, isLocale, isRTLLocale } from "./locales";
import { directionalIcon, startAlign } from "./rtl";
import { getLocale, setLocale } from "./store";
import { translate } from "./translate";

afterEach(() => setLocale("en"));

describe("i18n catalog", () => {
  it("translates every English key into Arabic (no missing keys)", () => {
    const enKeys = Object.keys(en) as MessageKey[];
    const missing = enKeys.filter((key) => !ar[key] || ar[key].trim() === "");
    expect(missing).toEqual([]);
  });

  it("defaults to English and resolves a key for the active locale", () => {
    expect(getLocale()).toBe(DEFAULT_LOCALE);
    expect(translate("en", "common.retry")).toBe("Retry");
    expect(translate("ar", "common.retry")).toBe("إعادة المحاولة");
  });

  it("interpolates named tokens and leaves unknown ones verbatim", () => {
    expect(translate("en", "home.available", { count: 8 })).toBe("8 available");
    expect(translate("en", "more.subtitle", { tenant: "Acme" })).toContain("Acme");
    expect(translate("en", "home.available", {})).toBe("{count} available");
  });

  it("switching locale updates the store for subsequent reads", () => {
    setLocale("ar");
    expect(getLocale()).toBe("ar");
    expect(translate(getLocale(), "nav.home")).toBe("الرئيسية");
  });
});

describe("locale helpers", () => {
  it("identifies RTL locales and valid locale codes", () => {
    expect(isRTLLocale("ar")).toBe(true);
    expect(isRTLLocale("en")).toBe(false);
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("mirrors directional icons only under RTL", () => {
    expect(directionalIcon("chevron-right", false)).toBe("chevron-right");
    expect(directionalIcon("chevron-right", true)).toBe("chevron-left");
    expect(directionalIcon("arrow-left", true)).toBe("arrow-right");
    // Non-directional icons are untouched.
    expect(directionalIcon("check", true)).toBe("check");
    expect(startAlign(true)).toBe("right");
    expect(startAlign(false)).toBe("left");
  });
});
