import { usePathname, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useI18n, type MessageKey } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { haptic } from "../ui/haptics";
import { AppIcon, type AppIconName } from "../ui/Icon";
import { radius, shadows, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useReducedMotion } from "../ui/useReducedMotion";
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
  const { styles } = useStyles();
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
      <NavigationBar
        items={items.filter((item) => item.available)}
        selected={selected}
        onNavigate={(item) => {
          if (pathname === item.route) return;
          if (selected !== item.id) haptic("light");
          router.replace(item.route);
        }}
      />
    </View>
  );
}

function NavigationBar({
  items,
  selected,
  onNavigate,
}: {
  items: readonly PrimaryNavigationItem[];
  selected: PrimaryNavigationItem["id"];
  onNavigate: (item: PrimaryNavigationItem) => void;
}) {
  const { styles } = useStyles();
  const reduceMotion = useReducedMotion();
  const [layouts, setLayouts] = useState<Record<string, LayoutRectangle>>({});
  const [position] = useState(() => new Animated.Value(0));
  const positioned = useRef(false);
  const target = layouts[selected];

  useLayoutEffect(() => {
    if (!target) return;
    position.stopAnimation();
    if (!positioned.current || reduceMotion) {
      position.setValue(target.x);
      positioned.current = true;
      return;
    }
    const animation = Animated.spring(position, {
      toValue: target.x,
      stiffness: 320,
      damping: 30,
      mass: 0.8,
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [position, target, reduceMotion]);

  return (
    <SafeAreaView edges={["bottom"]} pointerEvents="box-none" style={styles.navigationSafeArea}>
      <View style={styles.navigation} accessibilityRole="tablist">
        {target ? (
          <View pointerEvents="none" style={styles.navigationIndicatorLayer}>
            <Animated.View
              pointerEvents="none"
              accessible={false}
              style={[
                styles.navigationIndicator,
                {
                  width: target.width,
                  height: target.height,
                  top: target.y,
                  transform: [{ translateX: position }],
                },
              ]}
            />
          </View>
        ) : null}
        {items.map((item) => {
          const active = selected === item.id;
          return (
            <Pressable
              key={item.id}
              testID={`nav-${item.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              aria-selected={active}
              onPress={() => onNavigate(item)}
              onLayout={({ nativeEvent: { layout } }) => {
                setLayouts((previous) => {
                  const current = previous[item.id];
                  if (
                    current?.x === layout.x &&
                    current.y === layout.y &&
                    current.width === layout.width &&
                    current.height === layout.height
                  )
                    return previous;
                  return { ...previous, [item.id]: layout };
                });
              }}
              {...webNavigationItem(active)}
              style={({ pressed }) => [
                styles.navigationItem,
                active && !target && styles.navigationItemActive,
                pressed && styles.navigationItemPressed,
              ]}
            >
              <NavigationIcon name={item.icon} active={active} reduceMotion={reduceMotion} />
              <Text style={[styles.navigationLabel, active && styles.navigationLabelActive]}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function NavigationIcon({
  name,
  active,
  reduceMotion,
}: {
  name: AppIconName;
  active: boolean;
  reduceMotion: boolean;
}) {
  const { styles, colors } = useStyles();
  const [focus] = useState(() => new Animated.Value(active ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) {
      focus.setValue(active ? 1 : 0);
      return;
    }
    const animation = Animated.spring(focus, {
      toValue: active ? 1 : 0,
      stiffness: 360,
      damping: 20,
      mass: 0.6,
      useNativeDriver: Platform.OS !== "web",
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [active, reduceMotion, focus]);
  return (
    <Animated.View
      {...webNavigationIcon}
      style={[
        styles.iconContainer,
        {
          transform: [
            { translateY: focus.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
            { scale: focus.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) },
          ],
        },
      ]}
    >
      <AppIcon name={name} size={22} color={active ? colors.onBrand : colors.inkSubtle} />
    </Animated.View>
  );
}

const useStyles = createThemedStyles((colors) => {
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
    navigationIndicatorLayer: {
      ...StyleSheet.absoluteFill,
      // onLayout supplies physical x coordinates in both reading directions.
      direction: "ltr",
    },
    navigationIndicator: {
      position: "absolute",
      insetInlineStart: 0,
      borderRadius: 21,
      backgroundColor: colors.brand,
      shadowColor: colors.brandStrong,
      shadowOpacity: 0.2,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
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
      ...typography.micro,
      fontWeight: "700",
      letterSpacing: 0.15,
    },
    navigationLabelActive: { color: colors.onBrand, fontWeight: "800" },
  });
  return { colors, styles };
});
