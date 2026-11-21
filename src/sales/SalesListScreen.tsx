import type { Sale, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  EmptyState,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  SkeletonRows,
  SummaryStrip,
  Surface,
  TextButton,
  ReadOnlyChip,
} from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useAsync } from "../ui/useAsync";
import {
  saleBenefitLabel,
  saleLiveState,
  saleScopeLabel,
  saleStateLabel,
  saleStateTone,
} from "./display";

export type SalesListClient = Pick<TenantCommerceClient, "listSales" | "listCollections">;

/**
 * Sales on items: per-item online price reductions shown on the website as the reduced price with the
 * original struck through and a "-N% OFF" badge. promotions.read to view; promotions.manage to edit.
 */
export function SalesListScreen({
  client,
  canRead,
  canManage,
  onOpenSale,
  onCreateSale,
  onBack,
}: {
  client: SalesListClient;
  canRead: boolean;
  canManage: boolean;
  onOpenSale: (saleId: string) => void;
  onCreateSale: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const header = (
    <PageHeader
      eyebrow={t("storefront.title")}
      title={t("sales.title")}
      icon="sale-outline"
      onBack={onBack}
    />
  );
  if (!canRead) {
    return (
      <ScrollScreen>
        {header}
        <Notice tone="warning" title={t("sales.accessTitle")} message={t("sales.accessBody")} />
      </ScrollScreen>
    );
  }
  return (
    <SalesListContent
      client={client}
      canManage={canManage}
      header={header}
      onOpenSale={onOpenSale}
      onCreateSale={onCreateSale}
    />
  );
}

function SalesListContent({
  client,
  canManage,
  header,
  onOpenSale,
  onCreateSale,
}: {
  client: SalesListClient;
  canManage: boolean;
  header: React.ReactNode;
  onOpenSale: (saleId: string) => void;
  onCreateSale: () => void;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const load = useCallback(async () => {
    const [sales, collections] = await Promise.all([
      client.listSales(),
      client.listCollections().catch(() => ({ collections: [] })),
    ]);
    return {
      sales: sales.items,
      collectionNames: new Map(collections.collections.map((c) => [c.id, c.name])),
    };
  }, [client]);
  const { state, reload, refresh, refreshing } = useAsync(load);
  const liveCount = useMemo(
    () =>
      state.status === "success"
        ? state.data.sales.filter((s) => saleLiveState(s) === "live").length
        : 0,
    [state],
  );

  return (
    <ScrollScreen onRefresh={refresh} refreshing={refreshing}>
      {header}
      {canManage ? (
        <Surface tone="brand">
          <SectionHeading title={t("sales.workspaceTitle")} />
          <Body>{t("sales.workspaceBody")}</Body>
          <PrimaryButton
            label={t("sales.createCta")}
            icon="plus"
            testID="create-sale"
            onPress={onCreateSale}
          />
        </Surface>
      ) : (
        <ReadOnlyChip />
      )}

      {state.status === "loading" ? <SkeletonRows rows={3} /> : null}
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
      {state.status === "success" ? (
        <>
          <SummaryStrip
            items={[
              {
                label: t("sales.metricTotal"),
                value: String(state.data.sales.length),
                icon: "sale-outline",
              },
              {
                label: t("sales.metricLive"),
                value: String(liveCount),
                icon: "check-circle-outline",
                tone: "accent",
              },
            ]}
          />
          {state.data.sales.length === 0 ? (
            <EmptyState
              icon="sale-outline"
              title={t("sales.emptyTitle")}
              message={t("sales.emptyBody")}
            />
          ) : (
            <View style={styles.list}>
              {state.data.sales.map((sale) => (
                <SaleRow
                  key={sale.id}
                  sale={sale}
                  collectionName={
                    sale.collectionId
                      ? state.data.collectionNames.get(sale.collectionId)
                      : undefined
                  }
                  onPress={() => onOpenSale(sale.id)}
                />
              ))}
            </View>
          )}
        </>
      ) : null}
    </ScrollScreen>
  );
}

function SaleRow({
  sale,
  collectionName,
  onPress,
}: {
  sale: Sale;
  collectionName?: string;
  onPress: () => void;
}) {
  const { styles } = useStyles();
  const live = saleLiveState(sale);
  return (
    <PressableRow testID={`sale-row-${sale.id}`} onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.name}>{sale.name}</Text>
          <Text style={styles.meta}>
            {saleBenefitLabel(sale)} · {saleScopeLabel(sale, collectionName)}
          </Text>
        </View>
        <Badge label={saleStateLabel(live)} tone={saleStateTone(live)} />
      </View>
    </PressableRow>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    list: { gap: spacing.sm },
    row: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
    copy: { flex: 1, gap: 3 },
    name: { color: colors.ink, ...typography.cardTitle, fontWeight: "800" },
    meta: { color: colors.inkMuted, ...typography.caption },
  });
  return { colors, styles };
});
