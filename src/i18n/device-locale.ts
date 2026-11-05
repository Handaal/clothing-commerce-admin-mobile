import { Platform } from "react-native";

import { DEFAULT_LOCALE, type Locale } from "./locales";

/**
 * Best-effort device-language detection, defaulting to English. Kept deliberately defensive: it runs
 * at module load across web, native and the node/jsdom test environment, so any failure (missing
 * global, unresolved native module) must degrade to the default rather than throw. On web we read
 * `navigator.language`; on native we lazily require `expo-localization` so it is never pulled into
 * the web/test bundle.
 */
export function detectDeviceLocale(): Locale {
  try {
    if (Platform.OS === "web") {
      const lang = typeof navigator !== "undefined" ? navigator.language : "";
      return normalize(lang);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Localization = require("expo-localization") as {
      getLocales?: () => { languageCode?: string | null }[];
    };
    const code = Localization.getLocales?.()[0]?.languageCode ?? "";
    return normalize(code);
  } catch {
    return DEFAULT_LOCALE;
  }
}

function normalize(tag: string): Locale {
  return tag.toLowerCase().startsWith("ar") ? "ar" : DEFAULT_LOCALE;
}
