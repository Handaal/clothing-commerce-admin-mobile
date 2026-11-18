import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

/** Keep native navigation and custom motion aligned with the device accessibility preference. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof matchMedia === "undefined") return;
      const media = matchMedia("(prefers-reduced-motion: reduce)");
      const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
      media.addEventListener("change", onChange);
      let active = true;
      void Promise.resolve().then(() => {
        if (active) setReduced(media.matches);
      });
      return () => {
        active = false;
        media.removeEventListener("change", onChange);
      };
    }
    let active = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      receivedChange = true;
      setReduced(value);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(
      (value) => {
        if (active && !receivedChange) setReduced(value);
      },
      () => {},
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
