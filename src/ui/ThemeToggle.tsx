import { Pressable, StyleSheet, Text, View } from "react-native";

import { useI18n, type MessageKey } from "../i18n";
import { FormSection } from "./components";
import { AppIcon, type AppIconName } from "./Icon";
import { radius, spacing, type ThemeMode, typography } from "./theme";
import { createThemedStyles, useTheme } from "./useTheme";

const OPTIONS: readonly { mode: ThemeMode; labelKey: MessageKey; icon: AppIconName }[] = [
  { mode: "system", labelKey: "theme.system", icon: "cellphone-cog" },
  { mode: "light", labelKey: "theme.light", icon: "white-balance-sunny" },
  { mode: "dark", labelKey: "theme.dark", icon: "weather-night" },
];

/**
 * Appearance picker (System / Light / Dark). Applies immediately and persists across launches.
 * Rendered on the More screen — a presentation preference, not tenant configuration.
 */
export function ThemeToggle() {
  const { styles, colors } = useStyles();
  const { t } = useI18n();
  const { mode, setMode } = useTheme();

  return (
    <FormSection
      title={t("theme.title")}
      description={t("theme.description")}
      icon="theme-light-dark"
    >
      <View style={styles.row} accessibilityRole="radiogroup">
        {OPTIONS.map((option) => {
          const active = option.mode === mode;
          return (
            <Pressable
              key={option.mode}
              testID={`theme-${option.mode}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => setMode(option.mode)}
              style={({ pressed }) => [
                styles.segment,
                active && styles.segmentActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <AppIcon
                name={option.icon}
                size={18}
                color={active ? colors.brand : colors.inkSubtle}
              />
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {t(option.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </FormSection>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    row: { flexDirection: "row", gap: spacing.sm },
    segment: {
      flex: 1,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    segmentActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
    segmentText: { color: colors.inkMuted, ...typography.label, fontWeight: "700" },
    segmentTextActive: { color: colors.brand, fontWeight: "800" },
  });
  return { colors, styles };
});
