// Design tokens for Admin Mobile. The whole app is token-driven: every screen and shared primitive
// reads from the active palette through useTheme or createThemedStyles. The palette is the
// boutique "clay" identity shared with the POS — a deep forest green brand over warm, creamy
// surfaces, with a terracotta clay accent. Fonts, radii, motion, and shadows are tuned to the same
// editorial, calm, premium feel.
//
// ── Dark mode (P15) ──────────────────────────────────────────────────────────────────────────────
// Web colors use CSS custom properties, and native styles subscribe through createThemedStyles:
//   • On WEB every token resolves to a CSS custom property, e.g. `var(--c-canvas, <light fallback>)`.
//     The light/dark values of those variables live in app/+html.tsx and flip via the OS setting
//     (`prefers-color-scheme`) or an explicit `data-theme` attribute the theme store sets. Because the
//     variable is read by the browser at paint time, switching is instant and covers every existing
//     StyleSheet — no per-component change needed.
//   • On NATIVE useTheme resolves the saved preference or OS appearance. createThemedStyles caches
//     each palette's styles and updates mounted consumers without losing screen or form state.

import { Platform } from "react-native";

export const lightColors = {
  // Surfaces — warm cream canvas rising to near-white cards.
  canvas: "#F5F1EA",
  canvasWarm: "#FBF8F2",
  surface: "#FFFDF9",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#EFE8DC",
  surfaceSunken: "#ECE5DB",

  // Hairlines.
  border: "#DAD0C2",
  borderStrong: "#C9BCA8",
  borderSoft: "#ECE5DB",

  // Ink — warm, not pure black.
  ink: "#211C18",
  inkMuted: "#5A4F44",
  inkSubtle: "#8A7D6F",

  // Brand — deep forest green.
  brand: "#26413A",
  brandStrong: "#172A24",
  brandPressed: "#172A24",
  brandSoft: "#E6EDE9",
  brandSoftStrong: "#D2E0D9",
  onBrandDim: "#9DB1A6",
  // Foreground that sits ON a saturated fill (brand/accent/status button, active tab, badge-less chip).
  // White in light; in dark every fill becomes light, so this flips to a deep ink for readable contrast.
  onBrand: "#FFFFFF",
  // A brand surface kept intentionally dark in BOTH themes — the dashboard hero stays a premium
  // deep-forest showcase whether the UI is light or dark, so its white-on-brand styling never inverts.
  brandFixed: "#26413A",

  // Accent — terracotta clay.
  accent: "#A23F2D",
  accentStrong: "#84301F",
  accentSoft: "#F7ECE8",
  accentBorder: "#EAD4CC",

  // Status — tuned to the warm palette.
  info: "#2F5D8F",
  infoSoft: "#EAF1F8",
  infoBorder: "#CFE0F0",
  success: "#216844",
  successSoft: "#E3EFE8",
  successBorder: "#BCD9C7",
  warning: "#8A5A1B",
  warningSoft: "#F8EEDD",
  warningBorder: "#E7D3AE",
  danger: "#8F2A1C",
  dangerSoft: "#FBE7E1",
  dangerBorder: "#E8C3B9",

  white: "#FFFFFF",
  scrim: "rgba(33, 28, 24, 0.10)",
  // Translucent overlays used on the dark brand hero.
  onBrandVeil: "rgba(255, 253, 249, 0.12)",
  onBrandVeilStrong: "rgba(255, 253, 249, 0.18)",
} as const;

export type ColorPalette = Record<keyof typeof lightColors, string>;

/**
 * The POS "ink green" dark theme — deep green-charcoal surfaces (not brown), warm ivory ink, a
 * lightened forest brand that reads on dark, and softened status tones. Kept in step with the POS
 * `:root[data-theme="dark"]` tokens so both management surfaces look like one product at night.
 */
export const darkColors: ColorPalette = {
  canvas: "#0E1210",
  canvasWarm: "#121714",
  surface: "#151B18",
  surfaceRaised: "#1D2520",
  surfaceMuted: "#232D27",
  surfaceSunken: "#0B0F0D",

  border: "#2B332D",
  borderStrong: "#3A453E",
  borderSoft: "#222A24",

  ink: "#ECE6DA",
  inkMuted: "#BAB3A4",
  inkSubtle: "#A39C8C",

  brand: "#7FA896",
  brandStrong: "#A9C8B9",
  brandPressed: "#6C9D86",
  brandSoft: "#18251F",
  brandSoftStrong: "#22352C",
  onBrandDim: "#94A39A",
  onBrand: "#0E1210",
  brandFixed: "#1A2B25",

  accent: "#E08A62",
  accentStrong: "#EF9F78",
  accentSoft: "#2A211B",
  accentBorder: "#4A372C",

  info: "#8FBCE6",
  infoSoft: "#15202B",
  infoBorder: "#26384A",
  success: "#7BD3A4",
  successSoft: "#16271E",
  successBorder: "#2B4635",
  warning: "#ECCD86",
  warningSoft: "#2D2512",
  warningBorder: "#54431C",
  danger: "#F0A493",
  dangerSoft: "#2B1A15",
  dangerBorder: "#55302A",

  white: "#FFFFFF",
  scrim: "rgba(0, 0, 0, 0.55)",
  onBrandVeil: "rgba(255, 253, 249, 0.10)",
  onBrandVeilStrong: "rgba(255, 253, 249, 0.16)",
};

/** User-facing theme preference. "system" follows the OS appearance. */
export type ThemeMode = "system" | "light" | "dark";

/** The CSS custom-property name for a palette token (kept in sync with {@link cssVarsDeclaration}). */
export function cssVarName(token: keyof ColorPalette): string {
  return `--c-${token}`;
}

/**
 * Emits the `--c-<token>: <value>;` lines for a palette, for injection into a `:root` (light) or
 * `:root[data-theme="dark"]` block in app/+html.tsx. Light and dark both flow through here so a new
 * token can never be declared for one theme and forgotten for the other.
 */
export function cssVarsDeclaration(palette: ColorPalette): string {
  return (Object.keys(lightColors) as (keyof ColorPalette)[])
    .map((token) => `  ${cssVarName(token)}: ${palette[token]};`)
    .join("\n");
}

function buildWebPalette(): ColorPalette {
  const out = {} as Record<keyof ColorPalette, string>;
  for (const token of Object.keys(lightColors) as (keyof ColorPalette)[]) {
    // Fallback keeps the page sane if the variable is ever missing (e.g. SSR before CSS applies).
    out[token] = `var(${cssVarName(token)}, ${lightColors[token]})`;
  }
  return out;
}

/**
 * Web CSS references. Native components obtain their current palette through useTheme.
 */
export const colors: ColorPalette = Platform.OS === "web" ? buildWebPalette() : lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

// Font families. On web these are loaded in app/+html.tsx (Google Fonts) and the sans is applied
// globally to the document body, so every Text inherits it; only display titles opt into the serif.
// On native the families fall back to the system UI font if unavailable.
export const fonts = {
  // Editorial serif for display titles — the "catchy" boutique voice.
  serif: 'Fraunces, Georgia, "Times New Roman", serif',
  // Crisp professional display sans for tenant/store identity and prominent branded labels.
  displaySans: 'Manrope, "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
  // Clean, friendly geometric sans for everything else.
  sans: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
} as const;

// One phone-first type scale. Every Text in the app should spread one of these tokens instead of a
// hand-typed fontSize, so sizes stay consistent and headers never outgrow a phone screen. The steps:
//   display 28 · pageTitle 24 · title 20 · sectionTitle 18 · subtitle/cardTitle 16 · body 15 ·
//   bodySmall 14 · label 13 · caption 12 · micro 11
export const typography = {
  // Hero / brand moments only (e.g. the business name on Home).
  display: {
    fontFamily: fonts.displaySans,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800" as const,
    letterSpacing: -0.6,
  },
  // Every screen's header title.
  pageTitle: {
    fontFamily: fonts.displaySans,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800" as const,
    letterSpacing: -0.4,
  },
  // Detail-screen summary names and dialog titles.
  title: {
    fontFamily: fonts.displaySans,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800" as const,
    letterSpacing: -0.3,
  },
  // Section headings inside a screen.
  sectionTitle: {
    fontFamily: fonts.displaySans,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800" as const,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800" as const,
    letterSpacing: -0.1,
  },
  // List-row and card titles.
  cardTitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800" as const,
    letterSpacing: -0.1,
  },
  // Big numbers in metric tiles.
  metric: {
    fontFamily: fonts.displaySans,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800" as const,
    letterSpacing: -0.3,
  },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, fontWeight: "500" as const },
  bodySmall: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, fontWeight: "500" as const },
  // Buttons, form labels and emphasized inline values.
  label: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, fontWeight: "700" as const },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, fontWeight: "600" as const },
  // Badges, eyebrows, tab labels and secondary metadata (SKU, dates). Never smaller than this.
  micro: { fontFamily: fonts.sans, fontSize: 11, lineHeight: 15, fontWeight: "700" as const },
} as const;

export const layout = {
  contentMaxWidth: 720,
  wideContentMaxWidth: 1040,
  formMaxWidth: 620,
  touchTarget: 44,
  navigationClearance: 104,
} as const;

// Motion — shared easing + durations matching the POS. Web transitions are applied globally in
// app/+html.tsx; these values are exported so inline/animated code can stay in sync.
export const motion = {
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
  // A gentle overshoot for entrances/knobs — premium, spring-like without a physics engine.
  easeOut: "cubic-bezier(0.22, 1, 0.36, 1)",
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  fast: 130,
  medium: 200,
  slow: 320,
} as const;

export const shadows = {
  // Warm, low shadows — the cream palette reads best with soft brown-tinted elevation.
  card: {
    shadowColor: "#3D2D1F",
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#3D2D1F",
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 6,
  },
  navigation: {
    shadowColor: "#3D2D1F",
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
} as const;
