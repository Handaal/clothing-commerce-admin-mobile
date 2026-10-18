export const colors = {
  canvas: "#F6F7FB",
  canvasWarm: "#FBFAF7",
  surface: "#FFFFFF",
  surfaceRaised: "#FFFFFF",
  surfaceMuted: "#F0F2F7",
  border: "#E3E7EF",
  borderStrong: "#CDD3DF",
  ink: "#17182B",
  inkMuted: "#62677A",
  inkSubtle: "#8A90A2",
  brand: "#4F46E5",
  brandPressed: "#3730A3",
  brandSoft: "#EEF2FF",
  brandSoftStrong: "#E0E7FF",
  accent: "#0F766E",
  accentSoft: "#E6F6F3",
  info: "#2563EB",
  infoSoft: "#EAF2FF",
  success: "#15803D",
  successSoft: "#EAF8EF",
  warning: "#B45309",
  warningSoft: "#FFF5E6",
  danger: "#C2414B",
  dangerSoft: "#FDECEF",
  white: "#FFFFFF",
  scrim: "rgba(23, 24, 43, 0.08)",
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

export const typography = {
  pageTitle: { fontSize: 30, lineHeight: 36, fontWeight: "800" as const },
  sectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: "800" as const },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: "800" as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "500" as const },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: "600" as const },
} as const;

export const layout = {
  contentMaxWidth: 720,
  formMaxWidth: 620,
  touchTarget: 44,
} as const;

export const shadows = {
  card: {
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  navigation: {
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -5 },
    elevation: 12,
  },
} as const;
