import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../src/i18n";
import { groupedManagementSections, SECTION_GROUP_LABEL_KEYS } from "../src/navigation/sections";
import { useSession } from "../src/session/SessionProvider";
import { tenantDisplayName } from "../src/tenant/presentation";
import {
  ConfirmDialog,
  Divider,
  PageHeader,
  PressableRow,
  ScrollScreen,
  Surface,
  TextButton,
} from "../src/ui/components";
import { AppIcon } from "../src/ui/Icon";
import { LanguageToggle } from "../src/ui/LanguageToggle";
import { ThemeToggle } from "../src/ui/ThemeToggle";
import { radius, spacing, typography } from "../src/ui/theme";
import { createThemedStyles } from "../src/ui/useTheme";

export default function MoreRoute() {
  const { styles, colors } = useStyles();
  const router = useRouter();
  const { state, signOut } = useSession();
  const { t } = useI18n();
  const [signOutOpen, setSignOutOpen] = useState(false);

  if (state.phase !== "ready") return <Redirect href="/" />;

  const businessName = tenantDisplayName(state.context.tenant.name);
  const groups = groupedManagementSections(state.context);

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("more.eyebrow")}
        title={t("more.title")}
        description={t("more.subtitle", { tenant: businessName })}
      />

      {/* Tools grouped by the task the owner is doing, most frequent first. */}
      {groups.map((bucket) => (
        <View key={bucket.group} style={styles.group}>
          <View style={styles.groupHeading}>
            <AppIcon
              name={SECTION_GROUP_LABEL_KEYS[bucket.group].icon}
              size={16}
              color={colors.accent}
            />
            <Text style={styles.groupTitle}>
              {t(SECTION_GROUP_LABEL_KEYS[bucket.group].labelKey)}
            </Text>
          </View>
          <View style={styles.list}>
            {bucket.sections.map((section) => (
              <PressableRow
                key={section.id}
                testID={`section-${section.id}`}
                onPress={() => router.push(section.route!)}
              >
                <View style={styles.sectionRow}>
                  <View style={styles.iconTile}>
                    <AppIcon name={section.icon} size={22} color={colors.brand} />
                  </View>
                  <View style={styles.copy}>
                    <Text numberOfLines={1} style={styles.title}>
                      {t(section.labelKey)}
                    </Text>
                    <Text numberOfLines={2} style={styles.description}>
                      {t(section.descriptionKey)}
                    </Text>
                  </View>
                </View>
              </PressableRow>
            ))}
          </View>
        </View>
      ))}

      {/* ─── Account (last: set once, rarely changed) ───────────────────────────────────────── */}
      <View style={styles.group}>
        <View style={styles.groupHeading}>
          <AppIcon name="account-circle-outline" size={16} color={colors.accent} />
          <Text style={styles.groupTitle}>{t("more.account")}</Text>
        </View>
        <Surface testID="more-account" style={styles.accountCard}>
          <View style={styles.accountRow}>
            <View style={styles.accountSeal}>
              <Text style={styles.accountInitial}>
                {businessName.trim().slice(0, 1).toUpperCase() || "•"}
              </Text>
            </View>
            <View style={styles.accountCopy}>
              <Text style={styles.accountLabel}>{t("more.activeBusiness")}</Text>
              <Text numberOfLines={1} style={styles.accountName}>
                {businessName}
              </Text>
            </View>
          </View>
          <Divider />
          <ThemeToggle />
          <Divider />
          <LanguageToggle />
          <Divider />
          <TextButton
            testID="more-sign-out"
            label={t("more.signOut")}
            icon="logout"
            onPress={() => setSignOutOpen(true)}
          />
        </Surface>
      </View>

      <ConfirmDialog
        testID="sign-out-dialog"
        visible={signOutOpen}
        title={t("more.signOutTitle")}
        message={t("more.signOutMessage")}
        confirmLabel={t("more.signOut")}
        icon="logout"
        onCancel={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          void signOut();
        }}
      />
    </ScrollScreen>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    accountCard: { gap: spacing.md },
    accountRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    accountSeal: {
      width: 52,
      height: 52,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.lg,
      backgroundColor: colors.brand,
    },
    accountInitial: { color: colors.onBrand, ...typography.title },
    accountCopy: { flex: 1, minWidth: 0, gap: 2 },
    accountLabel: {
      color: colors.accent,
      ...typography.micro,
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
    },
    accountName: { color: colors.ink, ...typography.subtitle },
    accountStatus: {
      color: colors.inkMuted,
      ...typography.caption,
      fontWeight: "600",
      textTransform: "capitalize",
    },
    group: { gap: spacing.sm },
    groupHeading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: spacing.sm,
    },
    groupTitle: {
      color: colors.inkMuted,
      ...typography.caption,
      fontWeight: "800",
      letterSpacing: 0.8,
      textTransform: "uppercase",
    },
    list: { gap: spacing.md },
    sectionRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
    iconTile: {
      width: 48,
      height: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    iconTileMuted: { backgroundColor: colors.surfaceMuted },
    copy: { flex: 1, gap: 4 },
    title: { color: colors.ink, ...typography.cardTitle, fontWeight: "800" },
    description: { color: colors.inkMuted, ...typography.caption, fontWeight: "500" },
  });
  return { colors, styles };
});
