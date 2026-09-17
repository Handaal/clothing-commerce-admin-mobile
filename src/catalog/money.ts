/**
 * Integer-minor-unit safe money conversion for the catalog price editor.
 *
 * Money is NEVER represented as a floating-point number internally: the SDK's price surface is entirely
 * in integer minor units (`amountMinor`), and every conversion here is done with integer/string math so
 * a decimal like `25.99` can never drift to `2598.9999…` minor units. The UX accepts a decimal string
 * from the manager and this module converts it exactly.
 *
 * The Commerce contract carries only a `currency` string and an integer `amountMinor`; it does not
 * expose per-currency fraction-digit metadata. This catalog uses 2-fraction-digit currencies (e.g.
 * USD), so 2 is the default — the same assumption the read-only `formatMoneyMinor` display already
 * makes. `fractionDigits` is explicit so a future 0- or 3-digit currency slice can pass the real value.
 */

export type MoneyParseResult = { ok: true; amountMinor: number } | { ok: false; error: string };

/**
 * Parse a user-entered decimal amount (e.g. `"25.99"`) into integer minor units. Rejects anything that
 * is not a plain non-negative decimal — no signs, thousands separators, currency symbols, or exponent
 * notation — because those are ambiguous and the API is authoritative on the final value anyway.
 */
export function parseAmountToMinor(input: string, fractionDigits = 2): MoneyParseResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: false, error: "Enter a price." };
  }
  // A whole part and an optional fractional part, digits only.
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    return { ok: false, error: "Enter a valid amount, for example 25.99." };
  }
  const whole = match[1];
  const frac = match[2] ?? "";
  if (frac.length > fractionDigits) {
    return {
      ok: false,
      error:
        fractionDigits === 0
          ? "This currency does not use decimal places."
          : `Use at most ${fractionDigits} decimal place${fractionDigits === 1 ? "" : "s"}.`,
    };
  }
  // Build the minor-unit integer entirely as a string, then parse exactly once. No division/multiply,
  // so there is no floating-point rounding step anywhere in the conversion.
  const paddedFrac = frac.padEnd(fractionDigits, "0");
  const minorString = `${whole}${paddedFrac}`.replace(/^0+(?=\d)/, "");
  const amountMinor = Number(minorString);
  if (!Number.isSafeInteger(amountMinor)) {
    return { ok: false, error: "That amount is too large." };
  }
  if (amountMinor <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  return { ok: true, amountMinor };
}

/**
 * Render an integer minor-unit amount back into a plain decimal input string (e.g. `2599 → "25.99"`),
 * used to seed the edit field from an existing price. Pure integer/string math, no float.
 */
export function formatMinorToInput(amountMinor: number, fractionDigits = 2): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor)
    .toString()
    .padStart(fractionDigits + 1, "0");
  const cut = abs.length - fractionDigits;
  const whole = abs.slice(0, cut);
  const frac = abs.slice(cut);
  const body = fractionDigits === 0 ? whole : `${whole}.${frac}`;
  return negative ? `-${body}` : body;
}
