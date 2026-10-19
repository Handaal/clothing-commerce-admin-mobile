import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";

import { colors } from "./theme";

export type AppIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function AppIcon({
  name,
  size = 22,
  color = colors.inkMuted,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
}) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
