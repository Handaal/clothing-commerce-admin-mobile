import { Text } from "react-native";

/** Test-only stand-in. Production resolves the real Expo vector icon component. */
export default function MaterialCommunityIcons({
  color,
  size,
}: {
  name?: string;
  color?: string;
  size?: number;
}) {
  return <Text accessibilityElementsHidden style={{ color, fontSize: size }} />;
}
