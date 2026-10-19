import { ClerkProvider } from "@clerk/expo";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { clerkTokenCache } from "../src/auth/token-cache";
import { getClerkPublishableKey } from "../src/config/env";
import { ManagementShell } from "../src/navigation/ManagementShell";
import { SessionProvider } from "../src/session/SessionProvider";
import { Body, Eyebrow, Screen, Title } from "../src/ui/components";

export default function RootLayout() {
  const publishableKey = getClerkPublishableKey();

  if (!publishableKey) {
    // Fail clearly instead of crashing inside Clerk with a missing key.
    return (
      <Screen>
        <StatusBar style="dark" />
        <Eyebrow>Configuration required</Eyebrow>
        <Title>Clerk is not configured</Title>
        <Body>
          Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file to enable authentication. This is
          a public key and is safe to embed; never place the Clerk secret key here.
        </Body>
      </Screen>
    );
  }

  return (
    <SafeAreaProvider>
      <ClerkProvider publishableKey={publishableKey} tokenCache={clerkTokenCache}>
        <SessionProvider>
          <StatusBar style="dark" />
          <ManagementShell>
            <Stack screenOptions={{ headerShown: false }} />
          </ManagementShell>
        </SessionProvider>
      </ClerkProvider>
    </SafeAreaProvider>
  );
}
