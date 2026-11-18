import { useSyncExternalStore } from "react";
import { Platform } from "react-native";

import { colors, darkColors, lightColors, type ColorPalette, type ThemeMode } from "./theme";
import { getResolvedScheme, getThemeMode, setThemeMode, subscribe } from "./theme-store";

export interface Theme {
  /** The user's preference: "system" | "light" | "dark". */
  mode: ThemeMode;
  /** The concrete scheme in effect right now ("system" resolved against the OS). */
  resolved: "light" | "dark";
  colors: ColorPalette;
  setMode: (mode: ThemeMode) => void;
}

/**
 * Subscribe a component to the active theme preference. Re-renders on a theme switch and, in "system"
 * mode, on an OS appearance change. Works with or without any provider — the store defaults to
 * "system", so tests and unprovided renders are unaffected.
 */
export function useTheme(): Theme {
  const mode = useSyncExternalStore(subscribe, getThemeMode, getThemeMode);
  const resolved = useSyncExternalStore(subscribe, getResolvedScheme, getResolvedScheme);
  const palette = Platform.OS === "web" ? colors : resolved === "dark" ? darkColors : lightColors;
  return { mode, resolved, colors: palette, setMode: setThemeMode };
}

/** Cache each stylesheet by palette while subscribing every consumer to appearance changes. */
export function createThemedStyles<T>(createStyles: (palette: ColorPalette) => T) {
  const cache = new WeakMap<ColorPalette, T>();
  return function useThemedStyles(): T {
    const { colors: palette } = useTheme();
    let styles = cache.get(palette);
    if (styles === undefined) {
      styles = createStyles(palette);
      cache.set(palette, styles);
    }
    return styles;
  };
}
