// Design tokens for Admin Mobile. The whole app is token-driven: every screen and shared primitive
// reads from here, so re-tinting these values re-skins the entire product. The palette is the
// boutique "clay" identity shared with the POS — a deep forest green brand over warm, creamy
// surfaces, with a terracotta clay accent. Fonts, radii, motion, and shadows are tuned to the same
// editorial, calm, premium feel.

export const colors = {
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

  // Accent — terracotta clay.
  accent: "#A23F2D",
  accentStrong: "#84301F",
  accentSoft: "#F7ECE8",

  // Status — tuned to the warm palette.
  info: "#2F5D8F",
  infoSoft: "#EAF1F8",
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

export const typography = {
  display: {
    fontFamily: fonts.displaySans,
    fontSize: 36,
    lineHeight: 43,
    fontWeight: "800" as const,
    letterSpacing: -0.8,
  },
  pageTitle: {
    fontFamily: fonts.displaySans,
    fontSize: 32,
    lineHeight: 39,
    fontWeight: "800" as const,
    letterSpacing: -0.7,
  },
  sectionTitle: {
    fontFamily: fonts.displaySans,
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "800" as const,
    letterSpacing: -0.35,
  },
  cardTitle: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800" as const,
    letterSpacing: -0.2,
  },
  body: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 22, fontWeight: "500" as const },
  caption: { fontFamily: fonts.sans, fontSize: 12, lineHeight: 17, fontWeight: "600" as const },
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
  fast: 130,
  medium: 200,
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
