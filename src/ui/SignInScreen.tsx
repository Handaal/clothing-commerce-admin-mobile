import { useSignIn } from "@clerk/expo";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { Body, Eyebrow, PrimaryButton, Screen, Title } from "./components";

/**
 * Minimal real Clerk email/password sign-in using the Clerk core-3 signals API. This drives the
 * actual Clerk sign-in flow; it does not simulate authentication. Without valid Clerk credentials +
 * a real user, `signIn.password` returns a real error which is surfaced here rather than faked into
 * a signed-in state.
 */
export function SignInScreen() {
  const { signIn } = useSignIn();
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: passwordError } = await signIn.password({ emailAddress, password });
      if (passwordError) {
        setError(clerkErrorMessage(passwordError));
        return;
      }
      if (signIn.status === "complete") {
        // Sets the newly created session as active.
        await signIn.finalize();
      } else {
        // e.g. MFA / additional verification required — not implemented in this checkpoint.
        setError(`Additional verification required (status: ${signIn.status}).`);
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Eyebrow>Authorized management channel</Eyebrow>
      <Title>Sign in</Title>
      <Body>Sign in with your manager account to continue.</Body>

      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          testID="sign-in-email"
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          value={emailAddress}
          onChangeText={setEmailAddress}
          placeholder="you@business.com"
          placeholderTextColor="#9ca3af"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          testID="sign-in-password"
          style={styles.input}
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#9ca3af"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <PrimaryButton
        testID="sign-in-submit"
        label={submitting ? "Signing in…" : "Sign in"}
        onPress={onSubmit}
        disabled={submitting}
      />
    </Screen>
  );
}

function clerkErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const maybe = error as { message?: string; errors?: { message?: string }[] };
    return (
      maybe.errors?.[0]?.message ??
      maybe.message ??
      "Sign-in failed. Check your credentials and connection."
    );
  }
  return "Sign-in failed. Check your credentials and connection.";
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: "#4b5563", fontSize: 13, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd6fe",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#faf5ff",
  },
  error: { color: "#dc2626", fontSize: 14, fontWeight: "600" },
});
