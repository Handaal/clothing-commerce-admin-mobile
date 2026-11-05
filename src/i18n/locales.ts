// Supported UI locales. English is the source language (its catalog values are the canonical copy);
// Arabic is a full right-to-left translation. Western (Latin) digits are used in both locales — a
// deliberate choice for a commerce/admin surface where SKUs, prices and codes read clearest in 0-9.

export const LOCALES = ["en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

const RTL_LOCALES: readonly Locale[] = ["ar"];

export function isRTLLocale(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function isLocale(value: string | null | undefined): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}

/** Endonyms — each language named in its own script, as language pickers should show them. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};
