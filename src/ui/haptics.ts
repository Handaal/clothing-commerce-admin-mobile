import { Platform, Vibration } from "react-native";

/**
 * Lightweight, dependency-free haptics. Uses React Native's built-in {@link Vibration} on native so
 * no extra native module / rebuild is required; a no-op on web. Durations are tuned to feel like a
 * crisp tap (light), a firmer press (medium), and a short double-pulse for success/confirm.
 *
 * Call these from interaction handlers (primary actions, confirmations, tab switches) to make the app
 * feel tactile and premium. They never throw — a platform without a vibrator simply ignores them.
 */
type HapticKind = "light" | "medium" | "success" | "warning";

const PATTERNS: Record<HapticKind, number | number[]> = {
  light: 8,
  medium: 16,
  // [wait, vibrate, wait, vibrate] — a gentle two-step affirmation.
  success: [0, 14, 60, 22],
  warning: [0, 22, 50, 22],
};

export function haptic(kind: HapticKind = "light"): void {
  if (Platform.OS === "web") return;
  try {
    Vibration.vibrate(PATTERNS[kind]);
  } catch {
    // Device without a vibrator, or a platform that rejects the call — feedback is best-effort.
  }
}
