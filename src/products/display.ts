import type { CommerceErrorKind } from "../commerce/errors";

/** Human heading for a classified Commerce failure, shared by the product read surfaces. */
export function errorHeading(kind: CommerceErrorKind): string {
  switch (kind) {
    case "auth":
      return "Session problem";
    case "forbidden":
      return "Access denied";
    case "not-found":
      return "Not found";
    case "network":
      return "Cannot reach the Commerce API";
    case "contract":
      return "Unexpected response";
    case "server":
    case "unknown":
      return "Something went wrong";
  }
}

/**
 * Formats a minor-unit amount for read-only display, e.g. `(2599, "USD") → "USD 25.99"`. The API
 * returns `amountMinor` in the currency's minor units; we render two fraction digits, which is
 * correct for the currencies this catalog uses. No rounding or currency conversion is invented.
 */
export function formatMoneyMinor(amountMinor: number, currency: string): string {
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

/**
 * Retry is only meaningful for transient failures. Authentication (needs re-sign-in), authorization
 * (server-authoritative denial) and not-found (the resource does not exist) are stable facts, so we
 * do not offer a retry that would simply reproduce them.
 */
export function isRetryable(kind: CommerceErrorKind): boolean {
  return kind === "network" || kind === "server" || kind === "contract" || kind === "unknown";
}
