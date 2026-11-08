import type { AppIconName } from "../ui/Icon";

// Horizontally-directional glyphs must mirror under RTL so "next/forward/back" still point correctly.
// Symmetric icons are left untouched.
const MIRRORED: Partial<Record<string, AppIconName>> = {
  "chevron-right": "chevron-left",
  "chevron-left": "chevron-right",
  "arrow-right": "arrow-left",
  "arrow-left": "arrow-right",
  "arrow-up-right": "arrow-up-left",
  login: "login", // directional but the MCI glyph reads fine either way
};

/** Pick the writing-direction-correct variant of a directional icon. */
export function directionalIcon(name: AppIconName, isRTL: boolean): AppIconName {
  if (!isRTL) return name;
  return MIRRORED[name as string] ?? name;
}

/** Text alignment for content that should hug the reading-start / reading-end edge. */
export function startAlign(isRTL: boolean): "left" | "right" {
  return isRTL ? "right" : "left";
}
export function endAlign(isRTL: boolean): "left" | "right" {
  return isRTL ? "left" : "right";
}
