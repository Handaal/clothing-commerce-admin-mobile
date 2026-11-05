import { useMemo, useSyncExternalStore } from "react";

import type { MessageKey } from "./catalog";
import { isRTLLocale, type Locale } from "./locales";
import { getLocale, setLocale, subscribe } from "./store";
import { translate, type TParams } from "./translate";

export interface I18n {
  locale: Locale;
  isRTL: boolean;
  dir: "rtl" | "ltr";
  /** Translate a message key for the active locale, with optional `{token}` interpolation. */
  t: (key: MessageKey, params?: TParams) => string;
  /** Switch the whole app's language (persisted + flips writing direction). */
  setLocale: (locale: Locale) => void;
}

/**
 * Subscribe a component to the active locale. Re-renders on a language switch (via the external
 * store), so every `t(...)` call re-resolves. Works with or without any provider — in tests the store
 * defaults to English, so screens render their source copy unchanged.
 */
export function useI18n(): I18n {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  return useMemo<I18n>(
    () => ({
      locale,
      isRTL: isRTLLocale(locale),
      dir: isRTLLocale(locale) ? "rtl" : "ltr",
      t: (key, params) => translate(locale, key, params),
      setLocale,
    }),
    [locale],
  );
}

/** Standalone translator for non-component code. Reads the current locale but does not subscribe. */
export function t(key: MessageKey, params?: TParams): string {
  return translate(getLocale(), key, params);
}
