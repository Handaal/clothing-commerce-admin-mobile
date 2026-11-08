import { I18nManager, Platform } from "react-native";

import { detectDeviceLocale } from "./device-locale";
import { isLocale, isRTLLocale, type Locale } from "./locales";

/**
 * A tiny module-level locale store. It is intentionally framework-light: components subscribe through
 * {@link useI18n} (via `useSyncExternalStore`), while non-component code can read {@link getLocale}
 * directly. Defaulting to the detected device language — English in the test environment — means every
 * screen renders its source English copy with no provider, so the existing unit tests are unaffected.
 */

const PERSIST_KEY = "admin.locale";

let current: Locale = detectDeviceLocale();
const listeners = new Set<() => void>();

// Apply the initial writing direction as soon as the module loads (web only; guarded for SSR/tests).
applyDirection(current);

export function getLocale(): Locale {
  return current;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  applyDirection(locale);
  void persistLocale(locale);
  listeners.forEach((listener) => listener());
}

/**
 * Load a previously chosen locale (if any) and apply it. Called once at app start, after the
 * synchronous device default is already in place, so a returning user's explicit choice wins.
 */
export async function restorePersistedLocale(): Promise<void> {
  const stored = await readPersistedLocale();
  if (isLocale(stored)) setLocale(stored);
}

function applyDirection(locale: Locale): void {
  const rtl = isRTLLocale(locale);
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
      document.documentElement.setAttribute("lang", locale);
    }
    return;
  }
  // Native: align the RTL layout engine. A full flip of already-mounted native views needs an app
  // reload, but new renders and our explicit `dir`-aware styles respond immediately.
  try {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  } catch {
    // I18nManager can be unavailable in some environments — direction is still honoured on web.
  }
}

async function persistLocale(locale: Locale): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(PERSIST_KEY, locale);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as {
      setItemAsync: (k: string, v: string) => Promise<void>;
    };
    await SecureStore.setItemAsync(PERSIST_KEY, locale);
  } catch {
    // Persistence is best-effort; the in-memory choice still applies for this session.
  }
}

async function readPersistedLocale(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return typeof localStorage !== "undefined" ? localStorage.getItem(PERSIST_KEY) : null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as {
      getItemAsync: (k: string) => Promise<string | null>;
    };
    return await SecureStore.getItemAsync(PERSIST_KEY);
  } catch {
    return null;
  }
}
