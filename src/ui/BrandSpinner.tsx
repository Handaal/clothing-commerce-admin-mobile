import { useEffect, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View, type ViewProps } from "react-native";

import { useTheme } from "./useTheme";

/**
 * A branded loading indicator — a two-tone ring that spins, replacing the stock `ActivityIndicator`
 * for a more premium, on-brand feel. On web it animates through a CSS keyframe (`[data-spinner]` in
 * app/+html.tsx) so unit tests render a static node with no JS animation loop; on native it uses the
 * `Animated` API.
 */
const webSpinner = { dataSet: { spinner: "true" } } as unknown as ViewProps;

export function BrandSpinner({
  size = 24,
  color,
  track,
  testID,
}: {
  size?: number;
  color?: string;
  track?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  // Held in state (not a ref) so the value is a stable, render-safe handle we can interpolate below.
  const [spin] = useState(() => new Animated.Value(0));
  const borderWidth = Math.max(2, Math.round(size / 10));

  useEffect(() => {
    if (Platform.OS === "web") return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 820,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const ringStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth,
    borderColor: track ?? colors.brandSoftStrong,
    borderTopColor: color ?? colors.brand,
    borderRightColor: color ?? colors.brand,
  };

  if (Platform.OS === "web") {
    return (
      <View testID={testID} accessibilityRole="progressbar" style={ringStyle} {...webSpinner} />
    );
  }

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.View
      testID={testID}
      accessibilityRole="progressbar"
      style={[ringStyle, { transform: [{ rotate }] }]}
    />
  );
}

// Kept for parity with existing imports; the ring reads better than stacked styles.
export const spinnerStyles = StyleSheet.create({ hidden: { opacity: 0 } });
