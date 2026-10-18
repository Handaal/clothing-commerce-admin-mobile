import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { visibleManagementSections } from "../src/navigation/sections";
import { useSession } from "../src/session/SessionProvider";
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
import { colors, radius, spacing } from "../src/ui/theme";

const PRIMARY_IDS = new Set(["dashboard", "products", "orders", "inventory"]);

export default function MoreRoute() {
  const router = useRouter();
  const { state } = useSession();

  if (state.phase !== "ready") return <Redirect href="/" />;

  const sections = visibleManagementSections(state.context).filter(
    (section) => !PRIMARY_IDS.has(section.id),
  );
  const available = sections.filter((section) => section.route);
  const planned = sections.filter((section) => !section.route);

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Workspace" title="More" />
      <Body>All management tools for {state.context.tenant.name}, organized by purpose.</Body>
      <Divider />
      <SectionHeading
        title="Available"
        detail={`${available.length} ${available.length === 1 ? "section" : "sections"}`}
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
                <Text style={styles.title}>{section.label}</Text>
                <Text style={styles.description}>{section.description}</Text>
              </View>
              {section.status ? <Badge label={section.status} /> : null}
            </View>
          </PressableRow>
        ))}
      </View>

      {planned.length ? (
        <>
          <SectionHeading title="Coming later" detail="Contract pending" />
          <View style={styles.list}>
            {planned.map((section) => (
              <SurfaceRow key={section.id} testID={`section-${section.id}`}>
                <View style={styles.sectionRow}>
                  <View style={[styles.iconTile, styles.iconTileMuted]}>
                    <AppIcon name={section.icon} size={24} color={colors.inkSubtle} />
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.title}>{section.label}</Text>
                    <Text style={styles.description}>{section.description}</Text>
                  </View>
                  <Badge label="Planned" />
                </View>
              </SurfaceRow>
            ))}
          </View>
        </>
      ) : null}
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
