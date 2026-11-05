import { usePathname, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useI18n, type MessageKey } from "../i18n";
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

function webNavigationItem(active: boolean): ViewProps {
  return {
    dataSet: {
      navigationItem: "true",
      navigationActive: active ? "true" : "false",
    },
  } as unknown as ViewProps;
}

const webNavigationIcon = {
  dataSet: { navigationIcon: "true" },
} as unknown as ViewProps;

// Nav-bar presentation for the primary tabs: order, plus the label/icon the bottom bar uses (e.g.
// "Home" rather than the registry's "Dashboard"). Route and availability come from the registry so
// they can never drift from the rest of the app.
const PRIMARY_NAV_PRESENTATION: Record<
  (typeof PRIMARY_SECTION_IDS)[number],
  { labelKey: MessageKey; icon: AppIconName }
> = {
  dashboard: { labelKey: "nav.home", icon: "home-variant-outline" },
  orders: { labelKey: "nav.orders", icon: "receipt-text-outline" },
  inventory: { labelKey: "nav.inventory", icon: "warehouse" },
  products: { labelKey: "nav.products", icon: "tag-multiple-outline" },
};

/** Persistent phone navigation for authenticated management routes. */
export function ManagementShell({ children }: { children: ReactNode }) {
  const { state } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { t, dir } = useI18n();

  if (state.phase !== "ready") return children;

  const context = state.context;
  const items: readonly PrimaryNavigationItem[] = [
    ...PRIMARY_SECTION_IDS.map((id): PrimaryNavigationItem => {
      const section = managementSection(id);
      const presentation = PRIMARY_NAV_PRESENTATION[id];
      return {
        id,
        label: t(presentation.labelKey),
        icon: presentation.icon,
        route: section.route as ManagementRoute,
        available: section.visible(context),
      };
    }),
    { id: "more", label: t("nav.more"), icon: "dots-grid", route: "/more", available: true },
  ];
  const selected = activeSectionForPath(pathname);

  return (
    <View style={[styles.shell, { direction: dir }]}>
      <View style={styles.content}>{children}</View>
      <SafeAreaView edges={["bottom"]} pointerEvents="box-none" style={styles.navigationSafeArea}>
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
                  {...webNavigationItem(active)}
                  style={({ pressed }) => [
                    styles.navigationItem,
                    active && styles.navigationItemActive,
                    pressed && styles.navigationItemPressed,
                  ]}
                >
                  <View {...webNavigationIcon} style={styles.iconContainer}>
                    <AppIcon
                      name={item.icon}
                      size={active ? 23 : 22}
                      color={active ? colors.white : colors.inkSubtle}
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
  navigationSafeArea: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: "transparent",
  },
  navigation: {
    width: "100%",
    maxWidth: 760,
    minHeight: 74,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: 28,
    backgroundColor: colors.surfaceRaised,
    ...shadows.navigation,
  },
  navigationItem: {
    flex: 1,
    minWidth: 56,
    maxWidth: 112,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 3,
    paddingVertical: 5,
    borderRadius: 21,
  },
  navigationItemActive: {
    backgroundColor: colors.brand,
    shadowColor: colors.brandStrong,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  navigationItemPressed: { opacity: 0.82, transform: [{ scale: 0.94 }] },
  iconContainer: {
    width: 38,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  navigationLabel: {
    color: colors.inkSubtle,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  navigationLabelActive: { color: colors.white, fontWeight: "800" },
});
