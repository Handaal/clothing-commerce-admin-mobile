import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import type { ComponentProps } from "react";

import { useTheme } from "./useTheme";

export type AppIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export function AppIcon({
  name,
  size = 22,
  color,
}: {
  name: AppIconName;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color ?? colors.inkMuted} />;
}
