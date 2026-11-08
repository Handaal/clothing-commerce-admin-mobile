import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../src/i18n";
import { isPrimarySection, visibleManagementSections } from "../src/navigation/sections";
import { useSession } from "../src/session/SessionProvider";
import { tenantDisplayName } from "../src/tenant/presentation";
import {
  Badge,
  Body,
  Divider,
  PageHeader,
  PressableRow,
  ScrollScreen,
  SectionHeading,
  SurfaceRow,
} from "../src/ui/components";
import { AppIcon } from "../src/ui/Icon";
import { LanguageToggle } from "../src/ui/LanguageToggle";
import { colors, radius, spacing } from "../src/ui/theme";

export default function MoreRoute() {
  const router = useRouter();
  const { state } = useSession();
  const { t } = useI18n();

  if (state.phase !== "ready") return <Redirect href="/" />;

  const sections = visibleManagementSections(state.context).filter(
    (section) => !isPrimarySection(section.id),
  );
  const available = sections.filter((section) => section.route);
  const planned = sections.filter((section) => !section.route);

  return (
    <ScrollScreen>
      <PageHeader eyebrow={t("more.eyebrow")} title={t("more.title")} />
      <Body>{t("more.subtitle", { tenant: tenantDisplayName(state.context.tenant.name) })}</Body>
      <Divider />
      <SectionHeading
        title={t("more.available")}
        detail={`${available.length} ${available.length === 1 ? t("more.section") : t("more.sections")}`}
      />
      <View style={styles.list}>
        {available.map((section) => (
          <PressableRow
            key={section.id}
            testID={`section-${section.id}`}
            onPress={() => router.push(section.route!)}
          >
            <View style={styles.sectionRow}>
              <View style={styles.iconTile}>
                <AppIcon name={section.icon} size={24} color={colors.brand} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.title}>{t(section.labelKey)}</Text>
                <Text style={styles.description}>{t(section.descriptionKey)}</Text>
              </View>
              {section.status ? (
                <Badge
                  label={section.status === "reserved" ? t("more.reserved") : t("more.planned")}
                  tone="neutral"
                />
              ) : null}
            </View>
          </PressableRow>
        ))}
      </View>

      {planned.length ? (
        <>
          <SectionHeading title={t("more.comingLater")} detail={t("more.contractPending")} />
          <View style={styles.list}>
            {planned.map((section) => (
              <SurfaceRow key={section.id} testID={`section-${section.id}`}>
                <View style={styles.sectionRow}>
                  <View style={[styles.iconTile, styles.iconTileMuted]}>
                    <AppIcon name={section.icon} size={24} color={colors.inkSubtle} />
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.title}>{t(section.labelKey)}</Text>
                    <Text style={styles.description}>{t(section.descriptionKey)}</Text>
                  </View>
                  <Badge label={t("more.planned")} tone="neutral" />
                </View>
              </SurfaceRow>
            ))}
          </View>
        </>
      ) : null}

      <Divider />
      <LanguageToggle />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
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
  title: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 12, lineHeight: 18, fontWeight: "500" },
});
