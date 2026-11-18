import { ClerkProvider } from "@clerk/expo";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { clerkTokenCache } from "../src/auth/token-cache";
import { getClerkPublishableKey } from "../src/config/env";
import { restorePersistedLocale, useI18n } from "../src/i18n";
import { ManagementShell } from "../src/navigation/ManagementShell";
import { SessionProvider } from "../src/session/SessionProvider";
import { Body, Eyebrow, Screen, Title } from "../src/ui/components";
import { ThemedStatusBar } from "../src/ui/ThemedStatusBar";
import { useReducedMotion } from "../src/ui/useReducedMotion";
import { useTheme } from "../src/ui/useTheme";
import { restorePersistedTheme } from "../src/ui/theme-store";
import { ToastProvider } from "../src/ui/Toast";

const PRIMARY_ROUTES = new Set([
  "index",
  "orders/index",
  "inventory/index",
  "products/index",
  "more",
]);

export default function RootLayout() {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const [preferencesReady, setPreferencesReady] = useState(false);
  const publishableKey = getClerkPublishableKey();
  const { t, dir } = useI18n();

  // Restore preferences before mounting authenticated screens, avoiding a flash of the default theme.
  useEffect(() => {
    let active = true;
    void Promise.all([restorePersistedLocale(), restorePersistedTheme()]).then(() => {
      if (active) setPreferencesReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!preferencesReady) {
    return (
      <View style={[styles.root, { backgroundColor: colors.canvas }]}>
        <ThemedStatusBar />
      </View>
    );
  }

  if (!publishableKey) {
    // Fail clearly instead of crashing inside Clerk with a missing key.
    return (
      <View style={[styles.root, { direction: dir }]}>
        <Screen>
          <ThemedStatusBar />
          <Eyebrow>{t("config.eyebrow")}</Eyebrow>
          <Title>{t("config.clerkTitle")}</Title>
          <Body>{t("config.clerkBody")}</Body>
        </Screen>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={[styles.root, { direction: dir, backgroundColor: colors.canvas }]}>
        <ClerkProvider publishableKey={publishableKey} tokenCache={clerkTokenCache}>
          <ToastProvider>
            <SessionProvider>
              <ThemedStatusBar />
              <ManagementShell>
                <Stack
                  screenOptions={({ route }) => ({
                    headerShown: false,
                    // Primary destinations cross-fade. Details rise into place with a soft fade.
                    animation: reduceMotion
                      ? "none"
                      : PRIMARY_ROUTES.has(route.name)
                        ? "fade"
                        : "fade_from_bottom",
                    animationDuration: PRIMARY_ROUTES.has(route.name) ? 180 : 280,
                    animationTypeForReplace: "push",
                    gestureEnabled: true,
                    // Status bar style is owned by <ThemedStatusBar /> (expo-status-bar). Do not set
                    // `statusBarStyle` here: react-native-screens' per-screen status bar needs
                    // UIViewControllerBasedStatusBarAppearance=YES, which Expo Go doesn't set, so iOS
                    // shows a red error screen.
                    contentStyle: { backgroundColor: colors.canvas },
                  })}
                />
              </ManagementShell>
            </SessionProvider>
          </ToastProvider>
        </ClerkProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
