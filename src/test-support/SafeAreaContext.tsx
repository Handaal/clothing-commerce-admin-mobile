import type { ComponentProps, ReactNode } from "react";
import { View } from "react-native";

/**
 * The native safe-area package publishes Flow-typed internals that Node cannot parse directly.
 * Tests only need its layout boundary, so render that boundary as a regular web-compatible view.
 */
export function SafeAreaView({
  children,
  edges,
  ...props
}: ComponentProps<typeof View> & { children?: ReactNode; edges?: readonly string[] }) {
  void edges;
  return <View {...props}>{children}</View>;
}

/** Tests do not resolve device insets; render the provider as a transparent passthrough. */
export function SafeAreaProvider({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

/** Tests run without a device, so every edge inset is zero. */
export function useSafeAreaInsets() {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}
