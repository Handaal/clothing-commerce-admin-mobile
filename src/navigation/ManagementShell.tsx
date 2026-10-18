import { usePathname, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "../session/SessionProvider";
import { AppIcon, type AppIconName } from "../ui/Icon";
import { colors, radius, shadows, spacing } from "../ui/theme";
import type { ManagementRoute, ManagementSectionId } from "./sections";

interface PrimaryNavigationItem {
  id: ManagementSectionId | "more";
  label: string;
  icon: AppIconName;
  route: ManagementRoute;
  available: boolean;
}

function activeSection(pathname: string): ManagementSectionId | "more" {
  if (pathname === "/") return "dashboard";
  if (pathname.startsWith("/products")) return "products";
  if (pathname.startsWith("/orders")) return "orders";
  if (pathname.startsWith("/inventory")) return "inventory";
  return "more";
}

/** Persistent phone navigation for authenticated management routes. */
export function ManagementShell({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (state.phase !== "ready") return children;

  const items: readonly PrimaryNavigationItem[] = [
    { id: "dashboard", label: "Home", icon: "home-variant-outline", route: "/", available: true },
    {
      id: "orders",
      label: "Orders",
      icon: "receipt-text-outline",
      route: "/orders",
      available: state.context.access.orders.canRead,
    },
    {
      id: "inventory",
      label: "Inventory",
      icon: "warehouse",
      route: "/inventory",
      available: state.context.access.inventory.canRead,
    },
    {
      id: "products",
      label: "Products",
      icon: "tag-multiple-outline",
      route: "/products",
      available: state.context.access.catalog.canRead,
    },
    { id: "more", label: "More", icon: "dots-grid", route: "/more", available: true },
  ];
  const selected = activeSection(pathname);

  return (
    <View style={styles.shell}>
      <View style={styles.content}>{children}</View>
      <SafeAreaView edges={["bottom"]} style={styles.navigationSafeArea}>
        <View style={styles.navigation} accessibilityRole="tablist">
          {items
            .filter((item) => item.available)
            .map((item) => {
              const active = selected === item.id;
              return (
                <Pressable
                  key={item.id}
                  testID={`nav-${item.id}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => router.replace(item.route)}
                  style={({ pressed }) => [
                    styles.navigationItem,
                    active && styles.navigationItemActive,
                    pressed && styles.navigationItemPressed,
                  ]}
                >
                  <View style={[styles.iconContainer, active && styles.iconContainerActive]}>
                    <AppIcon
                      name={item.icon}
                      size={22}
                      color={active ? colors.brand : colors.inkSubtle}
                    />
                  </View>
                  <Text style={[styles.navigationLabel, active && styles.navigationLabelActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.canvas },
  content: { flex: 1 },
  navigationSafeArea: { backgroundColor: colors.surface },
  navigation: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-around",
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.navigation,
  },
  navigationItem: {
    flex: 1,
    minWidth: 56,
    maxWidth: 100,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: radius.md,
  },
  navigationItemActive: { backgroundColor: colors.brandSoft },
  navigationItemPressed: { opacity: 0.72 },
  iconContainer: {
    width: 34,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  iconContainerActive: { backgroundColor: colors.brandSoftStrong },
  navigationLabel: { color: colors.inkSubtle, fontSize: 10, fontWeight: "700" },
  navigationLabelActive: { color: colors.brand, fontWeight: "800" },
});
