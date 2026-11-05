import { Pressable, StyleSheet, Text, View } from "react-native";

import { LOCALE_LABELS, LOCALES, useI18n } from "../i18n";
import { FormSection } from "./components";
import { colors, radius, spacing } from "./theme";
import { useToast } from "./Toast";

/**
 * Device-local language picker (English ⇄ العربية). Switching flips the whole app's writing direction
 * and persists the choice. Rendered on the More screen; it is a presentation preference, not tenant
 * configuration.
 */
export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  const toast = useToast();

  return (
    <FormSection title={t("language.title")} description={t("language.description")} icon="translate">
      <View style={styles.row} accessibilityRole="radiogroup">
        {LOCALES.map((code) => {
          const active = code === locale;
          return (
            <Pressable
              key={code}
              testID={`language-${code}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (code === locale) return;
                setLocale(code);
                toast.success(t("language.changed"));
              }}
              style={({ pressed }) => [
                styles.segment,
                active && styles.segmentActive,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {LOCALE_LABELS[code]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </FormSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.sm },
  segment: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  segmentActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  segmentText: { color: colors.inkMuted, fontSize: 15, fontWeight: "700" },
  segmentTextActive: { color: colors.brand, fontWeight: "800" },
});
