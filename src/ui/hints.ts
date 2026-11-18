import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * A tiny persisted dismissal flag for one-time UI hints (e.g. a first-run onboarding card). Mirrors the
 * i18n store's best-effort persistence: web `localStorage`, native `expo-secure-store`. Persistence is
 * best-effort — a failure simply means the hint may reappear, never a crash.
 */
function keyFor(id: string): string {
  return `admin.hint.${id}.dismissed`;
}

async function readDismissed(id: string): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      return typeof localStorage !== "undefined" && localStorage.getItem(keyFor(id)) === "1";
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as {
      getItemAsync: (k: string) => Promise<string | null>;
    };
    return (await SecureStore.getItemAsync(keyFor(id))) === "1";
  } catch {
    return false;
  }
}

async function writeDismissed(id: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(keyFor(id), "1");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SecureStore = require("expo-secure-store") as {
      setItemAsync: (k: string, v: string) => Promise<void>;
    };
    await SecureStore.setItemAsync(keyFor(id), "1");
  } catch {
    // best-effort
  }
}

/**
 * Returns whether a one-time hint should be visible and a `dismiss` action. Starts hidden until the
 * persisted state is read (one tick), so a previously dismissed hint never flashes on screen.
 */
export function useDismissibleHint(id: string): { visible: boolean; dismiss: () => void } {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    void readDismissed(id).then((dismissed) => {
      if (active && !dismissed) setVisible(true);
    });
    return () => {
      active = false;
    };
  }, [id]);
  const dismiss = useCallback(() => {
    setVisible(false);
    void writeDismissed(id);
  }, [id]);
  return { visible, dismiss };
}
