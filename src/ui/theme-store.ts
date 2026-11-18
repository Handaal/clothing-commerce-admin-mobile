import { Appearance, Platform } from "react-native";

import type { ThemeMode } from "./theme";

/**
 * A tiny module-level theme store, mirroring the i18n locale store. Components subscribe via
 * {@link useTheme} (through `useSyncExternalStore`); non-component code can read {@link getThemeMode}.
 *
 * Applying the theme:
 *   • WEB — sets `data-theme` on <html> ("light"/"dark"), or removes it for "system" so the
 *     `prefers-color-scheme` media query in app/+html.tsx decides. CSS variables do the rest, so the
 *     switch is instant across every screen.
 *   • NATIVE — useTheme and createThemedStyles update mounted screens without remounting them.
 *     Appearance also updates native controls to match the selected scheme.
 */
const PERSIST_KEY = "admin.theme";
const VALID: readonly ThemeMode[] = ["system", "light", "dark"];

let mode: ThemeMode = "system";
let preferenceRevision = 0;
let persistence = Promise.resolve();
const listeners = new Set<() => void>();

// Apply the initial default. The root layout restores saved preferences before mounting screens.
applyTheme(mode);
// Re-notify subscribers when the OS appearance changes while in "system" mode, so resolved-scheme
// consumers (e.g. the native status bar) update. On web the CSS media query already handles visuals.
subscribeToSystem();

export function getThemeMode(): ThemeMode {
  return mode;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setThemeMode(next: ThemeMode): void {
  preferenceRevision += 1;
  if (next === mode) return;
  mode = next;
  applyTheme(next);
  persistence = persistence.then(() => persistThemeMode(next));
  listeners.forEach((listener) => listener());
}

/** The concrete scheme in effect right now, resolving "system" against the OS. */
export function getResolvedScheme(): "light" | "dark" {
  if (mode === "light" || mode === "dark") return mode;
  return systemScheme();
}

/** Load a previously chosen theme (if any) and apply it. Called once at app start. */
export async function restorePersistedTheme(): Promise<void> {
  const revision = preferenceRevision;
  const stored = await readPersistedTheme();
  if (revision !== preferenceRevision || !stored || !(VALID as string[]).includes(stored)) return;
  mode = stored as ThemeMode;
  applyTheme(mode);
  listeners.forEach((listener) => listener());
}

function systemScheme(): "light" | "dark" {
  if (Platform.OS === "web") {
    if (typeof matchMedia === "undefined") return "light";
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return Appearance.getColorScheme() === "dark" ? "dark" : "light";
}

function applyTheme(next: ThemeMode): void {
  if (Platform.OS !== "web") {
    Appearance.setColorScheme(next === "system" ? "unspecified" : next);
    return;
  }
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (next === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", next);
}

function subscribeToSystem(): void {
  const notifyIfSystem = () => {
    if (mode === "system") listeners.forEach((listener) => listener());
  };
  try {
    if (Platform.OS === "web") {
      if (typeof matchMedia === "undefined") return;
      matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", notifyIfSystem);
      return;
    }
    Appearance.addChangeListener(notifyIfSystem);
  } catch {
    // Appearance/matchMedia may be unavailable in some environments — system tracking is optional.
  }
}

async function persistThemeMode(next: ThemeMode): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(PERSIST_KEY, next);
      return;
    }
    const SecureStore = await import("expo-secure-store");
    await SecureStore.setItemAsync(PERSIST_KEY, next);
  } catch {
    // Best-effort; the in-memory choice still applies for this session.
  }
}

async function readPersistedTheme(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return typeof localStorage !== "undefined" ? localStorage.getItem(PERSIST_KEY) : null;
    }
    const SecureStore = await import("expo-secure-store");
    return await SecureStore.getItemAsync(PERSIST_KEY);
  } catch {
    return null;
  }
}
