import { StatusBar } from "expo-status-bar";

import { useTheme } from "./useTheme";

export function ThemedStatusBar() {
  const { resolved } = useTheme();
  return <StatusBar style={resolved === "dark" ? "light" : "dark"} />;
}
