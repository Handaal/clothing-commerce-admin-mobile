import { getLocale } from "./store";

/**
 * Format an API timestamp in the APP's language (not the phone's), e.g. "20 Nov 2026, 14:05" or its
 * Arabic equivalent. Latin digits are kept in Arabic too, matching the rest of the app (see locales.ts).
 * Malformed values are returned verbatim so nothing is silently hidden.
 */
export function formatDateTime(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const tag = getLocale() === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
  try {
    return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
