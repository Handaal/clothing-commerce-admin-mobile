import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";

import { getApiStatus, type ApiStatus } from "../src/api-status";

type DisplayStatus = "checking" | ApiStatus;

export default function HomeScreen() {
  const [connectionStatus, setConnectionStatus] = useState<DisplayStatus>("checking");

  useEffect(() => {
    let active = true;
    void getApiStatus().then((status) => {
      if (active) setConnectionStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  const label =
    connectionStatus === "checking"
      ? "Checking API…"
      : connectionStatus === "connected"
        ? "API Connected"
        : "API Unavailable";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Authorized management channel</Text>
          <Text style={styles.title}>Admin Management — Foundation Ready</Text>
          <View style={styles.statusRow}>
            <View
              accessibilityElementsHidden
              style={[
                styles.statusDot,
                connectionStatus === "connected" && styles.connected,
                connectionStatus === "unavailable" && styles.unavailable,
              ]}
            />
            <Text style={styles.statusText}>{label}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f5f3ff" },
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 620,
    borderWidth: 1,
    borderColor: "#ddd6fe",
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 36,
    shadowColor: "#5b21b6",
    shadowOpacity: 0.1,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  eyebrow: {
    marginBottom: 12,
    color: "#6d28d9",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: { color: "#2e1065", fontSize: 34, fontWeight: "700", lineHeight: 42 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 28 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#f59e0b" },
  connected: { backgroundColor: "#16a34a" },
  unavailable: { backgroundColor: "#dc2626" },
  statusText: { color: "#5b556b", fontSize: 16, fontWeight: "600" },
});
