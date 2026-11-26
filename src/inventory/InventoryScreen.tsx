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
  Badge,
  EmptyState,
  FilterChips,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ResponsiveList,
  ScrollScreen,
  SearchField,
  type SelectOption,
  SkeletonRows,
  SummaryStrip,
} from "../ui/components";
import { AppIcon } from "../ui/Icon";
import { radius, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useAsync } from "../ui/useAsync";
import { quarantineLegacyV1 } from "./journal/durable-store";
import { InventoryRecoveryPanel } from "./journal/InventoryRecoveryPanel";
import { loadAllInventory, type InventoryItem } from "./load";
import { StockItemSheet } from "./StockItemSheet";
import { useInventoryJournal } from "./useInventoryJournal";

export interface InventoryScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack?: () => void;
  /** Open "Receive new stock" (the POS Add-product flow). */
  onReceiveNew?: () => void;
  /** Open the Website / POS stock split (ADR-042). */
  onOpenSplit?: () => void;
}

const ALL_LOCATIONS = "all";
/** At or below this many pieces an item is flagged as running low. */
const LOW_STOCK = 5;

/**
 * Stock — the POS inventory desk on mobile. "Receive new stock" adds a brand-new item with its sizes and
 * quantities; tapping any item opens its actions (Edit details · Restock · Count · Transfer).
 */
export function InventoryScreen({
  tenantId,
  context,
  onReceiveNew,
  onOpenSplit,
}: InventoryScreenProps) {
  const { t } = useI18n();
  if (!context.access.inventory.canRead) {
    return (
      <ScrollScreen wide>
        <PageHeader title={t("inventory.title")} icon="warehouse" />
        <Notice
          tone="warning"
          title={t("inventory.accessTitle")}
          message={t("inventory.accessBody")}
        />
      </ScrollScreen>
    );
  }
  return (
    <StockContent
      tenantId={tenantId}
      context={context}
      onReceiveNew={onReceiveNew}
      onOpenSplit={onOpenSplit}
    />
  );
}

function StockContent({
  tenantId,
  context,
  onReceiveNew,
  onOpenSplit,
}: Omit<InventoryScreenProps, "onBack">) {
  const { styles, colors } = useStyles();
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const { journal, detectLegacy } = useInventoryJournal(tenantId, context);
  const load = useCallback(() => loadAllInventory(client), [client]);
  const { state, reload, refresh, refreshing } = useAsync<InventoryItem[]>(load);

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
  const supplierOptions = useMemo<SelectOption[] | undefined>(
    () =>
      suppliers.state.status === "success"
        ? suppliers.state.data.map((s) => ({
            value: s.id,
            label: s.referenceCode ? `${s.name} · ${s.referenceCode}` : s.name,
          }))
        : undefined,
    [suppliers.state],
  );

  const locationNames = useMemo(
    () => new Map(context.access.inventory.locations.map((l) => [l.id, l.name])),
    [context.access.inventory.locations],
  );
  const locationName = useCallback((id: string) => locationNames.get(id) ?? id, [locationNames]);

  // Fail closed: stock changes stay hidden until the recovery journal has been checked.
  const [writesReady, setWritesReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const onAvailabilityChange = useCallback((available: boolean) => {
    setWritesReady(available);
    if (available) setStorageFailed(false);
  }, []);
  const writesAvailable = writesReady && !storageFailed;

  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [conflictNotice, setConflictNotice] = useState(false);
  const [search, setSearch] = useState("");
  const [location, setLocation] = useState<string>(ALL_LOCATIONS);

  const onConflict = useCallback(() => {
    setSelected(null);
    setConflictNotice(true);
    reload();
  }, [reload]);

  const items = useMemo(() => (state.status === "success" ? state.data : []), [state]);
  const locationsWithStock = useMemo(
    () => [...new Set(items.map((i) => i.inventoryLocationId))],
    [items],
  );
  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (location !== ALL_LOCATIONS && item.inventoryLocationId !== location) return false;
      if (!term) return true;
      return [item.productName, item.sku, locationName(item.inventoryLocationId)].some((v) =>
        v.toLowerCase().includes(term),
      );
    });
  }, [items, location, locationName, search]);
  const units = visibleItems.reduce((sum, item) => sum + item.onHand, 0);
  const lowCount = visibleItems.filter((item) => item.onHand <= LOW_STOCK).length;

  const canReceiveNew =
    !!onReceiveNew && context.access.inventory.write.canReceive && context.access.catalog.canRead;

  return (
    <ScrollScreen wide onRefresh={refresh} refreshing={refreshing}>
      <PageHeader title={t("inventory.title")} icon="warehouse" />

      {canReceiveNew && onReceiveNew ? (
        <PrimaryButton
          testID="stock-receive-new"
          icon="package-variant-plus"
          label={t("receive.title")}
          onPress={onReceiveNew}
        />
      ) : null}
      {onOpenSplit && context.access.inventory.locations.length > 0 ? (
        <PrimaryButton
          testID="stock-open-split"
          icon="call-split"
          variant="secondary"
          label={t("split.entry")}
          onPress={onOpenSplit}
        />
      ) : null}

      {conflictNotice ? (
        <Notice
          testID="inventory-concurrency-notice"
          tone="warning"
          title={t("inventory.changedTitle")}
          message={t("inventory.changedBody")}
          action={
            <PrimaryButton
              label={t("common.dismiss")}
              variant="secondary"
              onPress={() => setConflictNotice(false)}
            />
          }
        />
      ) : null}

      {state.status === "success" ? (
        <InventoryRecoveryPanel
          journal={journal}
          client={client}
          items={state.data}
          locations={context.access.inventory.locations}
          onResolved={reload}
          detectLegacy={detectLegacy}
          quarantineLegacy={quarantineLegacyV1}
          onAvailabilityChange={onAvailabilityChange}
        />
      ) : null}
      {storageFailed ? (
        <Notice
          testID="inventory-writes-unavailable"
          tone="danger"
          title={t("invOps.storagePausedTitle")}
          message={t("invOps.storagePausedMsg")}
        />
      ) : null}

      {state.status === "loading" ? <SkeletonRows testID="inventory-loading" /> : null}
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

      {state.status === "success" && items.length === 0 ? (
        <EmptyState
          icon="package-variant-closed"
          title={t("inventory.emptyTitle")}
          message={t("inventory.emptyBody")}
        />
      ) : null}

      {state.status === "success" && items.length > 0 ? (
        <>
          {locationsWithStock.length > 1 ? (
            <FilterChips
              testIDPrefix="stock-location"
              selected={location}
              onSelect={setLocation}
              options={[
                { value: ALL_LOCATIONS, label: t("stock.allLocations") },
                ...locationsWithStock.map((id) => ({ value: id, label: locationName(id) })),
              ]}
            />
          ) : null}
          <SearchField
            value={search}
            onChangeText={setSearch}
            placeholder={t("inventory.searchPlaceholder")}
            testID="inventory-search"
          />
          <SummaryStrip
            testID="inventory-summary"
            items={[
              { label: t("stock.items"), value: String(visibleItems.length), icon: "hanger" },
              {
                label: t("stock.units"),
                value: String(units),
                icon: "package-variant",
                tone: "accent",
              },
              { label: t("stock.low"), value: String(lowCount), icon: "alert-circle-outline" },
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
                  onPress={() => {
                    setSearch("");
                    setLocation(ALL_LOCATIONS);
                  }}
                />
              }
            />
          ) : (
            <ResponsiveList>
              {visibleItems.map((item) => {
                const key = `${item.inventoryLocationId}:${item.variantId}`;
                return (
                  <PressableRow
                    key={key}
                    testID={`inventory-row-${key}`}
                    density="compact"
                    onPress={() => setSelected(item)}
                  >
                    <View style={styles.row}>
                      <View style={styles.icon}>
                        <AppIcon name="hanger" size={20} color={colors.brand} />
                      </View>
                      <View style={styles.copy}>
                        <Text numberOfLines={1} style={styles.name}>
                          {item.productName}
                        </Text>
                        <Text numberOfLines={1} style={styles.meta}>
                          {item.sku} · {locationName(item.inventoryLocationId)}
                        </Text>
                      </View>
                      <Badge
                        label={String(item.onHand)}
                        tone={
                          item.onHand === 0
                            ? "danger"
                            : item.onHand <= LOW_STOCK
                              ? "warning"
                              : "neutral"
                        }
                        testID={`inventory-onhand-${key}`}
                      />
                    </View>
                  </PressableRow>
                );
              })}
            </ResponsiveList>
          )}
        </>
      ) : null}

      <StockItemSheet
        // Remount on every open so the sheet always starts at the action menu.
        key={selected ? `${selected.inventoryLocationId}:${selected.variantId}` : "closed"}
        item={selected}
        client={client}
        journal={journal}
        write={context.access.inventory.write}
        canEditDetails={context.access.catalog.canRead}
        locationName={locationName}
        suppliers={supplierOptions}
        writesAvailable={writesAvailable}
        onClose={() => setSelected(null)}
        onChanged={reload}
        onConcurrencyConflict={onConflict}
        onStorageUnavailable={() => setStorageFailed(true)}
      />
    </ScrollScreen>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    icon: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    name: { color: colors.ink, ...typography.cardTitle },
    meta: { color: colors.inkMuted, ...typography.caption },
  });
  return { colors, styles };
});
