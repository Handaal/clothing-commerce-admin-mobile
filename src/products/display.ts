import type { CommerceErrorKind } from "../commerce/errors";
import { t } from "../i18n";

/**
 * Human heading for a classified Commerce failure, shared by the product read surfaces. Localized via
 * the standalone `t()` (reads the active locale); callers re-render on a language switch through their
 * own `useI18n` usage, so no call-site change was needed.
 */
export function errorHeading(kind: CommerceErrorKind): string {
  switch (kind) {
    case "auth":
      return t("errorHead.auth");
    case "forbidden":
      return t("errorHead.forbidden");
    case "not-found":
      return t("errorHead.notFound");
    case "validation":
      return t("errorHead.validation");
    case "network":
      return t("errorHead.network");
    case "contract":
      return t("errorHead.contract");
    case "server":
    case "unknown":
      return t("errorHead.unknown");
  }
}

/**
 * Formats a minor-unit amount for read-only display, e.g. `(2599, "EGP") → "EGP 25.99"`. The API
 * returns `amountMinor` in the currency's minor units; we render two fraction digits, which is
 * correct for the currencies this catalog uses. No rounding or currency conversion is invented.
 */
/**
 * "EGP 12,199.70" — thousands grouped like the Storefront and POS, so large figures read at a glance.
 * Grouping is done by hand (not Intl) so Hermes on every device prints the same thing.
 */
export function formatMoneyMinor(amountMinor: number, currency: string): string {
  const sign = amountMinor < 0 ? "-" : "";
  const [whole = "0", fraction = "00"] = (Math.abs(amountMinor) / 100).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${sign}${grouped}.${fraction}`;
}

/**
 * Retry is only meaningful for transient failures. Authentication (needs re-sign-in), authorization
 * (server-authoritative denial) and not-found (the resource does not exist) are stable facts, so we
 * do not offer a retry that would simply reproduce them.
 */
export function isRetryable(kind: CommerceErrorKind): boolean {
  return kind === "network" || kind === "server" || kind === "contract" || kind === "unknown";
}
