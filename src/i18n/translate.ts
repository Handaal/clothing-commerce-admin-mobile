import { catalogs, en, type MessageKey } from "./catalog";
import type { Locale } from "./locales";

export type TParams = Record<string, string | number>;

/**
 * Resolve a message for a locale, with English as the guaranteed fallback and `{token}` interpolation.
 * Unknown tokens are left verbatim so a missing param is visible rather than silently blank.
 */
export function translate(locale: Locale, key: MessageKey, params?: TParams): string {
  const message = catalogs[locale]?.[key] ?? en[key] ?? key;
  return params ? interpolate(message, params) : message;
}

function interpolate(template: string, params: TParams): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value == null ? match : String(value);
  });
}
