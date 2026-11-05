import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import { resolveSupplierAdapter } from "../suppliers/adapter";
import { loadAllSuppliers } from "../suppliers/load";
import type { SupplierSummary } from "../suppliers/model";
import {
  type ActionDockItem,
  Badge,
  EmptyState,
  HeaderIconButton,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ResponsiveList,
  ScrollScreen,
  SearchField,
  SectionHeading,
  type SelectOption,
  Surface,
  SurfaceRow,
  SummaryStrip,
} from "../ui/components";
import { AppIcon } from "../ui/Icon";
import { colors, radius, spacing } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { InventoryOperations, type InventoryOperationKind } from "./InventoryOperations";
import {
  createDurableJournalStore,
  quarantineLegacyV1,
  readLegacyV1Unresolved,
} from "./journal/durable-store";
import { createInventoryJournal } from "./journal/journal";
import type { JournalOwner } from "./journal/model";
import { secureIdempotencyKey } from "./idempotency";
import { loadAllInventory, type InventoryItem } from "./load";

export interface InventoryScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack?: () => void;
}

/** Inventory visibility and the three explicitly authorized management operations. */
export function InventoryScreen({ tenantId, context }: InventoryScreenProps) {
  const { t } = useI18n();
  if (!context.access.inventory.canRead) {
    return (
      <ScrollScreen wide>
        <PageHeader
          eyebrow={t("inventory.eyebrow")}
          title={t("inventory.title")}
          description={t("inventory.headerNoAccessDesc")}
          icon="warehouse"
        />
        <Notice
          tone="warning"
          title={t("inventory.accessTitle")}
          message={t("inventory.accessBody")}
        />
      </ScrollScreen>
    );
  }

  return <InventoryContent tenantId={tenantId} context={context} />;
}

function InventoryContent({ tenantId, context }: Omit<InventoryScreenProps, "onBack">) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const [activeOperation, setActiveOperation] = useState<InventoryOperationKind | null>(null);
  const [scrollToTopSignal, setScrollToTopSignal] = useState(0);
  const owner = useMemo<JournalOwner>(
    () => ({ tenantId, membershipId: context.membership.id }),
    [tenantId, context.membership.id],
  );
  const journal = useMemo(
    () => createInventoryJournal(createDurableJournalStore(owner), owner, secureIdempotencyKey),
    [owner],
  );
  const detectLegacy = useCallback(() => readLegacyV1Unresolved(owner), [owner]);
  const load = useCallback(() => loadAllInventory(client), [client]);
  const { state, reload } = useAsync<InventoryItem[]>(load);

  const supplierAdapter = useMemo(
    () => (context.access.suppliers?.canRead ? resolveSupplierAdapter(client) : null),
    [client, context.access.suppliers?.canRead],
  );
  const loadSuppliers = useCallback(
    () =>
      supplierAdapter
        ? loadAllSuppliers(supplierAdapter, { status: "active" })
        : Promise.resolve<SupplierSummary[]>([]),
    [supplierAdapter],
  );
  const suppliers = useAsync<SupplierSummary[]>(loadSuppliers);
  const receiveSuppliers = useMemo<SelectOption[] | undefined>(
    () =>
      suppliers.state.status === "success"
        ? suppliers.state.data.map((supplier) => ({
            value: supplier.id,
            label: supplier.referenceCode
              ? `${supplier.name} · ${supplier.referenceCode}`
              : supplier.name,
          }))
        : undefined,
    [suppliers.state],
  );

  const locationNameById = useMemo(
    () =>
      new Map(context.access.inventory.locations.map((location) => [location.id, location.name])),
    [context.access.inventory.locations],
  );
  const [concurrencyNotice, setConcurrencyNotice] = useState(false);
  const [search, setSearch] = useState("");
  const refreshAfterConcurrency = useCallback(() => {
    setActiveOperation(null);
    setConcurrencyNotice(true);
    reload();
  }, [reload]);

  const visibleItems = useMemo(() => {
    if (state.status !== "success") return [];
    const term = search.trim().toLowerCase();
    if (!term) return state.data;
    return state.data.filter((item) => {
      const locationName =
        locationNameById.get(item.inventoryLocationId) ?? item.inventoryLocationId;
      return [item.productName, item.sku, locationName].some((value) =>
        value.toLowerCase().includes(term),
      );
    });
  }, [locationNameById, search, state]);

  const visibleLocationCount = useMemo(
    () => new Set(visibleItems.map((item) => item.inventoryLocationId)).size,
    [visibleItems],
  );

  const requestOperation = useCallback((kind: InventoryOperationKind) => {
    setActiveOperation(kind);
    setScrollToTopSignal((signal) => signal + 1);
  }, []);

  const headerActions: ActionDockItem[] = [];
  if (state.status === "success" && state.data.length > 0) {
    if (context.access.inventory.write.canReceive) {
      headerActions.push({
        label: t("invOps.tabReceive"),
        icon: "package-down",
        onPress: () => requestOperation("receive"),
        testID: "inventory-action-receive",
      });
    }
    if (context.access.inventory.write.canAdjust) {
      headerActions.push({
        label: t("invOps.tabAdjust"),
        icon: "clipboard-check-outline",
        onPress: () => requestOperation("adjust"),
        testID: "inventory-action-adjust",
        emphasis: headerActions.length === 0 ? "primary" : "secondary",
      });
    }
    if (context.access.inventory.write.canTransfer) {
      headerActions.push({
        label: t("invOps.tabTransfer"),
        icon: "swap-horizontal",
        onPress: () => requestOperation("transfer"),
        testID: "inventory-action-transfer",
        emphasis: headerActions.length === 0 ? "primary" : "secondary",
      });
    }
    if (headerActions.length === 0) {
      headerActions.push({
        label: t("inventory.refresh"),
        icon: "refresh",
        onPress: reload,
        testID: "inventory-action-refresh",
      });
    }
  }

  return (
    <ScrollScreen wide scrollToTopSignal={scrollToTopSignal}>
      <PageHeader
        eyebrow={t("inventory.eyebrow")}
        title={t("inventory.title")}
        description={t("inventory.headerDesc")}
        icon="warehouse"
        action={
          headerActions.length > 0 ? (
            <View style={inventoryStyles.headerActions}>
              {headerActions.map((action, index) => (
                <HeaderIconButton
                  key={`${action.label}-${index}`}
                  label={action.label}
                  icon={action.icon}
                  testID={action.testID}
                  variant={action.emphasis === "secondary" ? "secondary" : "primary"}
                  onPress={action.onPress}
                />
              ))}
            </View>
          ) : undefined
        }
      />

      {concurrencyNotice ? (
        <Notice
          testID="inventory-concurrency-notice"
          tone="warning"
          title={t("inventory.changedTitle")}
          message={t("inventory.changedBody")}
          action={
            <PrimaryButton
              label={t("inventory.reviewRefreshed")}
              icon="refresh"
              variant="secondary"
              onPress={() => setConcurrencyNotice(false)}
            />
          }
        />
      ) : null}

      {state.status === "success" ? (
        <Surface tone="accent">
          <InventoryOperations
            client={client}
            journal={journal}
            locations={context.access.inventory.locations}
            write={context.access.inventory.write}
            items={state.data}
            onRefresh={reload}
            onConcurrencyConflict={refreshAfterConcurrency}
            receiveSuppliers={receiveSuppliers}
            detectLegacy={detectLegacy}
            quarantineLegacy={quarantineLegacyV1}
            activeOperation={activeOperation}
            onActiveOperationChange={setActiveOperation}
          />
        </Surface>
      ) : null}

      {state.status === "loading" ? <LoadingBlock label={t("inventory.loading")} /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <EmptyState
          icon="package-variant-closed"
          title={t("inventory.emptyTitle")}
          message={t("inventory.emptyBody")}
          action={<PrimaryButton label={t("inventory.refresh")} icon="refresh" onPress={reload} />}
        />
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <>
          <View style={inventoryStyles.catalogHeader}>
            <SectionHeading
              title={t("inventory.overviewHeading")}
              detail={t("common.shown", { count: visibleItems.length })}
            />
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder={t("inventory.searchPlaceholder")}
              testID="inventory-search"
            />
          </View>

          <SummaryStrip
            testID="inventory-summary"
            items={[
              {
                label: t("inventory.stockRows"),
                value: String(state.data.length),
                icon: "format-list-bulleted",
              },
              {
                label: t("inventory.locationsShown"),
                value: String(visibleLocationCount),
                icon: "map-marker-outline",
                tone: "accent",
              },
            ]}
          />

          {visibleItems.length === 0 ? (
            <EmptyState
              icon="magnify"
              title={t("inventory.noMatchTitle")}
              message={t("inventory.noMatchBody")}
              action={
                <PrimaryButton
                  label={t("inventory.clearSearch")}
                  icon="close-circle-outline"
                  onPress={() => setSearch("")}
                />
              }
            />
          ) : (
            <ResponsiveList>
              {visibleItems.map((item) => {
                const itemKey = `${item.inventoryLocationId}:${item.variantId}`;
                const locationName =
                  locationNameById.get(item.inventoryLocationId) ?? item.inventoryLocationId;
                return (
                  <SurfaceRow key={itemKey} testID={`inventory-row-${itemKey}`} density="compact">
                    <View style={inventoryStyles.stockIcon}>
                      <AppIcon name="hanger" size={22} color={colors.brand} />
                    </View>
                    <View style={inventoryStyles.stockCopy}>
                      <View style={inventoryStyles.stockTitleRow}>
                        <Text style={inventoryStyles.stockName}>{item.productName}</Text>
                        <Badge
                          label={String(item.onHand)}
                          tone={
                            item.onHand === 0 ? "danger" : item.onHand <= 5 ? "warning" : "neutral"
                          }
                          testID={`inventory-onhand-${itemKey}`}
                        />
                      </View>
                      <View style={inventoryStyles.stockMetadata}>
                        <Text style={inventoryStyles.skuText}>{item.sku}</Text>
                        <View style={inventoryStyles.metadataDot} />
                        <AppIcon name="map-marker-outline" size={14} color={colors.inkSubtle} />
                        <Text numberOfLines={1} style={inventoryStyles.locationText}>
                          {locationName}
                        </Text>
                      </View>
                    </View>
                  </SurfaceRow>
                );
              })}
            </ResponsiveList>
          )}
        </>
      ) : null}
    </ScrollScreen>
  );
}

const inventoryStyles = StyleSheet.create({
  headerActions: {
    maxWidth: 360,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  catalogHeader: { gap: spacing.md },
  stockIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  stockCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
  stockName: { flex: 1, color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  stockTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  stockMetadata: { flexDirection: "row", alignItems: "center", gap: 5 },
  skuText: { color: colors.inkMuted, fontSize: 10, lineHeight: 14, fontWeight: "700" },
  metadataDot: {
    width: 3,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  locationText: {
    flex: 1,
    color: colors.inkMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: "600",
  },
});
