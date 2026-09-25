import { describe, expect, it } from "vitest";

import { customDateRange, validateCustomDateRange } from "./date-range";

describe("reporting custom tenant-local dates", () => {
  it("accepts an ordered YYYY-MM-DD range without timezone conversion", () => {
    expect(customDateRange("2026-09-01", "2026-09-30")).toEqual({
      preset: "custom",
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("rejects missing or malformed dates", () => {
    expect(validateCustomDateRange("09/01/2026", "2026-09-30")).toBe(
      "Enter both dates as YYYY-MM-DD.",
    );
  });

  it("rejects an inverted range", () => {
    expect(validateCustomDateRange("2026-09-30", "2026-09-01")).toBe(
      "Start date must be on or before end date.",
    );
  });
});
