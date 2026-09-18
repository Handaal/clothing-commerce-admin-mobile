import { describe, expect, it } from "vitest";

import { formatMinorToInput, parseAmountToMinor } from "./money";

describe("parseAmountToMinor", () => {
  it("converts a two-decimal amount exactly to minor units", () => {
    expect(parseAmountToMinor("25.99")).toEqual({ ok: true, amountMinor: 2599 });
  });

  it("pads a missing or short fraction to the currency scale", () => {
    expect(parseAmountToMinor("25")).toEqual({ ok: true, amountMinor: 2500 });
    expect(parseAmountToMinor("25.9")).toEqual({ ok: true, amountMinor: 2590 });
  });

  it("does not drift on values that are unrepresentable in binary floating point", () => {
    // 0.1 + 0.2 style hazards: pure string math keeps these exact.
    expect(parseAmountToMinor("0.10")).toEqual({ ok: true, amountMinor: 10 });
    expect(parseAmountToMinor("0.29")).toEqual({ ok: true, amountMinor: 29 });
    expect(parseAmountToMinor("70.07")).toEqual({ ok: true, amountMinor: 7007 });
  });

  it("trims surrounding whitespace", () => {
    expect(parseAmountToMinor("  12.50  ")).toEqual({ ok: true, amountMinor: 1250 });
  });

  it("rejects more fraction digits than the currency allows", () => {
    const result = parseAmountToMinor("25.999");
    expect(result.ok).toBe(false);
  });

  it("rejects empty, non-numeric, signed, and exponent input", () => {
    for (const bad of ["", "abc", "-5.00", "1e3", "1,000.00", "$5", "5.", ".5"]) {
      expect(parseAmountToMinor(bad).ok).toBe(false);
    }
  });

  it("rejects zero and requires a positive selling price", () => {
    expect(parseAmountToMinor("0").ok).toBe(false);
    expect(parseAmountToMinor("0.00").ok).toBe(false);
  });

  it("rejects amounts beyond the safe integer range", () => {
    expect(parseAmountToMinor("999999999999999999").ok).toBe(false);
  });

  it("honours a zero-fraction currency scale", () => {
    expect(parseAmountToMinor("1500", 0)).toEqual({ ok: true, amountMinor: 1500 });
    expect(parseAmountToMinor("1500.5", 0).ok).toBe(false);
  });
});

describe("formatMinorToInput", () => {
  it("renders minor units back to a plain decimal string", () => {
    expect(formatMinorToInput(2599)).toBe("25.99");
    expect(formatMinorToInput(2500)).toBe("25.00");
    expect(formatMinorToInput(5)).toBe("0.05");
    expect(formatMinorToInput(0)).toBe("0.00");
  });

  it("round-trips with parseAmountToMinor", () => {
    for (const minor of [1, 10, 99, 2599, 100000]) {
      const text = formatMinorToInput(minor);
      expect(parseAmountToMinor(text)).toEqual({ ok: true, amountMinor: minor });
    }
  });

  it("honours a zero-fraction currency scale", () => {
    expect(formatMinorToInput(1500, 0)).toBe("1500");
  });
});
