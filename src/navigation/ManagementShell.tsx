import { usePathname, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "../session/SessionProvider";
import { AppIcon, type AppIconName } from "../ui/Icon";
import { colors, radius, shadows, spacing } from "../ui/theme";
import {
  activeSectionForPath,
  managementSection,
  PRIMARY_SECTION_IDS,
  type ManagementRoute,
  type ManagementSectionId,
} from "./sections";

interface PrimaryNavigationItem {
  id: ManagementSectionId | "more";
  label: string;
  icon: AppIconName;
  route: ManagementRoute;
  available: boolean;
}

// Nav-bar presentation for the primary tabs: order, plus the label/icon the bottom bar uses (e.g.
// "Home" rather than the registry's "Dashboard"). Route and availability come from the registry so
// they can never drift from the rest of the app.
const PRIMARY_NAV_PRESENTATION: Record<
  (typeof PRIMARY_SECTION_IDS)[number],
  { label: string; icon: AppIconName }
> = {
  dashboard: { label: "Home", icon: "home-variant-outline" },
  orders: { label: "Orders", icon: "receipt-text-outline" },
  inventory: { label: "Inventory", icon: "warehouse" },
  products: { label: "Products", icon: "tag-multiple-outline" },
};

/** Persistent phone navigation for authenticated management routes. */
export function ManagementShell({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (state.phase !== "ready") return children;

  const context = state.context;
  const items: readonly PrimaryNavigationItem[] = [
    ...PRIMARY_SECTION_IDS.map((id): PrimaryNavigationItem => {
      const section = managementSection(id);
      const presentation = PRIMARY_NAV_PRESENTATION[id];
      return {
        id,
        label: presentation.label,
        icon: presentation.icon,
        route: section.route as ManagementRoute,
        available: section.visible(context),
      };
    }),
    { id: "more", label: "More", icon: "dots-grid", route: "/more", available: true },
  ];
  const selected = activeSectionForPath(pathname);

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
