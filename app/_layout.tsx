import { ClerkProvider } from "@clerk/expo";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { clerkTokenCache } from "../src/auth/token-cache";
import { getClerkPublishableKey } from "../src/config/env";
import { restorePersistedLocale, useI18n } from "../src/i18n";
import { ManagementShell } from "../src/navigation/ManagementShell";
import { SessionProvider } from "../src/session/SessionProvider";
import { Body, Eyebrow, Screen, Title } from "../src/ui/components";
import { ToastProvider } from "../src/ui/Toast";

export default function RootLayout() {
  const publishableKey = getClerkPublishableKey();
  const { t, dir } = useI18n();

  // Apply a previously chosen language once at startup (after the synchronous device default).
  useEffect(() => {
    void restorePersistedLocale();
  }, []);

  if (!publishableKey) {
    // Fail clearly instead of crashing inside Clerk with a missing key.
    return (
      <View style={[styles.root, { direction: dir }]}>
        <Screen>
          <StatusBar style="dark" />
          <Eyebrow>{t("config.eyebrow")}</Eyebrow>
          <Title>{t("config.clerkTitle")}</Title>
          <Body>{t("config.clerkBody")}</Body>
        </Screen>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={[styles.root, { direction: dir }]}>
        <ClerkProvider publishableKey={publishableKey} tokenCache={clerkTokenCache}>
          <ToastProvider>
            <SessionProvider>
              <StatusBar style="dark" />
              <ManagementShell>
                <Stack screenOptions={{ headerShown: false }} />
              </ManagementShell>
            </SessionProvider>
          </ToastProvider>
        </ClerkProvider>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
