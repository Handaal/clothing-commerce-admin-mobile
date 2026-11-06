import { describe, expect, it } from "vitest";

import { TENANT_A, meContext } from "../test-support/fixtures";
import {
  attendanceCapabilities,
  defaultDateRange,
  formatMinutes,
  parseHours,
  parseMoneyInput,
  validateDateRange,
} from "./model";

describe("defaultDateRange", () => {
  it("spans the trailing 30 days through today (UTC)", () => {
    const range = defaultDateRange(new Date("2026-10-30T12:00:00.000Z"));
    expect(range).toEqual({ from: "2026-10-01", to: "2026-10-30" });
  });
});

describe("validateDateRange", () => {
  it("accepts a well-formed in-order range", () => {
    expect(validateDateRange({ from: "2026-09-01", to: "2026-09-30" })).toBeNull();
  });
  it("rejects a malformed date", () => {
    expect(validateDateRange({ from: "2026/09/01", to: "2026-09-30" })).not.toBeNull();
  });
  it("rejects an inverted range", () => {
    expect(validateDateRange({ from: "2026-09-30", to: "2026-09-01" })).not.toBeNull();
  });
});

describe("formatMinutes", () => {
  it("formats hours and minutes, and unknown as a dash", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(125)).toBe("2h 5m");
    expect(formatMinutes(null)).toBe("—");
  });
});

describe("parseMoneyInput", () => {
  it("parses a major amount and rejects invalid input", () => {
    expect(parseMoneyInput("12.50")).toEqual({ ok: true, amountMinor: 1250 });
    expect(parseMoneyInput("abc").ok).toBe(false);
  });
});

describe("parseHours", () => {
  it("accepts a positive number and rejects zero/negative", () => {
    expect(parseHours("8")).toEqual({ ok: true, hours: 8 });
    expect(parseHours("0").ok).toBe(false);
    expect(parseHours("-2").ok).toBe(false);
  });
});

describe("attendanceCapabilities", () => {
  it("derives from the staff capability", () => {
    expect(attendanceCapabilities(meContext(TENANT_A))).toEqual({ canRead: true, canManage: true });
    expect(
      attendanceCapabilities(meContext(TENANT_A, { staff: { canRead: true, canManage: false } })),
    ).toEqual({
      canRead: true,
      canManage: false,
    });
    expect(attendanceCapabilities(meContext(TENANT_A, { staff: null }))).toEqual({
      canRead: false,
      canManage: false,
    });
  });
});
