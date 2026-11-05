import type { CollectionListResponse, MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import { AppIcon } from "../ui/Icon";
import {
  Badge,
  Body,
  EmptyState,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  Surface,
  TextButton,
} from "../ui/components";
import { colors, radius, spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";

export interface CollectionsListScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onOpenCollection: (collectionId: string) => void;
  onCreateCollection: () => void;
  onBack: () => void;
}

/**
 * Collections list for the active tenant. Context controls navigation UX only; the Commerce API still
 * authorizes the read and every write independently.
 */
export function CollectionsListScreen({
  tenantId,
  context,
  onOpenCollection,
  onCreateCollection,
  onBack,
}: CollectionsListScreenProps) {
  const { t } = useI18n();

  if (!context.access.catalog.canRead) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("collections.eyebrow")}
          title={t("collections.title")}
          description={t("collections.headerDesc")}
          icon="shape-outline"
          onBack={onBack}
        />
        <Notice tone="warning" title={t("collections.accessTitle")} message={t("collections.accessBody")} />
      </ScrollScreen>
    );
  }

  return (
    <CollectionsListContent
      tenantId={tenantId}
      onOpenCollection={onOpenCollection}
      onCreateCollection={onCreateCollection}
      onBack={onBack}
    />
  );
}

function CollectionsListContent({
  tenantId,
  onOpenCollection,
  onCreateCollection,
  onBack,
}: Omit<CollectionsListScreenProps, "context">) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const load = useCallback(() => client.listCollections(), [client]);
  const { state, reload } = useAsync<CollectionListResponse>(load);

  const items = state.status === "success" ? state.data.collections : [];
  const publishedCount = items.filter((collection) => collection.status === "active").length;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("collections.eyebrow")}
        title={t("collections.title")}
        description={t("collections.headerDesc")}
        icon="shape-outline"
        onBack={onBack}
      />

      <Surface tone="brand" style={styles.overview}>
        <View style={styles.overviewCopy}>
          <Text style={styles.overviewTitle}>{t("collections.title")}</Text>
          <Body>{t("collections.headerDesc")}</Body>
        </View>
        <PrimaryButton
          label={t("collections.createCta")}
          icon="plus"
          testID="create-collection"
          onPress={onCreateCollection}
        />
      </Surface>

      {state.status === "success" ? (
        <View style={styles.metrics}>
          <MetricCard label={t("collections.loadedMetric")} value={String(items.length)} icon="shape-outline" />
          <MetricCard
            label={t("collections.activeMetric")}
            value={String(publishedCount)}
            icon="web-check"
            tone="accent"
          />
        </View>
      ) : null}

      <SectionHeading
        title={t("collections.heading")}
        detail={state.status === "success" ? t("common.shown", { count: items.length }) : undefined}
      />

      {state.status === "loading" ? <LoadingBlock label={t("collections.loading")} /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <TextButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && items.length === 0 ? (
        <EmptyState
          icon="shape-outline"
          title={t("collections.emptyTitle")}
          message={t("collections.emptyBody")}
        />
      ) : null}
      {state.status === "success" && items.length > 0 ? (
        <View style={styles.list}>
          {items.map((collection) => (
            <PressableRow
              key={collection.id}
              testID={`collection-row-${collection.id}`}
              onPress={() => onOpenCollection(collection.id)}
            >
              <View style={styles.rowTop}>
                <View style={styles.icon}>
                  <AppIcon name="shape-outline" size={24} color={colors.brand} />
                </View>
                <View style={styles.copy}>
                  <Text style={styles.name}>{collection.name}</Text>
                  <Text style={styles.meta}>
                    {t("collections.productCount", { count: collection.productCount })}
                  </Text>
                </View>
                <Badge label={collection.status} testID={`collection-status-${collection.id}`} />
              </View>
            </PressableRow>
          ))}
        </View>
      ) : null}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  overview: { gap: spacing.lg },
  overviewCopy: { gap: spacing.sm },
  overviewTitle: { color: colors.ink, ...typography.sectionTitle },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  list: { gap: spacing.md },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  icon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  copy: { flex: 1, gap: 3 },
  name: { color: colors.ink, ...typography.cardTitle },
  meta: { color: colors.inkMuted, ...typography.caption },
});
