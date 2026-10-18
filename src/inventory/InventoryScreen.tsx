import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import { resolveSupplierAdapter } from "../suppliers/adapter";
import { loadAllSuppliers } from "../suppliers/load";
import type { SupplierSummary } from "../suppliers/model";
import {
  Badge,
  Body,
  EmptyState,
  InfoRow,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SearchField,
  SectionHeading,
  type SelectOption,
  Surface,
  SurfaceRow,
  TextButton,
} from "../ui/components";
import { AppIcon } from "../ui/Icon";
import { colors, radius, spacing } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { InventoryOperations } from "./InventoryOperations";
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
  onBack: () => void;
}

/** Inventory visibility and the three explicitly authorized management operations. */
export function InventoryScreen({ tenantId, context, onBack }: InventoryScreenProps) {
  if (!context.access.inventory.canRead) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow="Operations"
          title="Inventory"
          description="Review stock availability across the locations assigned to your account."
          icon="warehouse"
          onBack={onBack}
        />
        <Notice
          tone="warning"
          title="Inventory access required"
          message="You do not have read access to inventory. Ask an owner or administrator."
        />
      </ScrollScreen>
    );
  }

  return <InventoryContent tenantId={tenantId} context={context} onBack={onBack} />;
}

function InventoryContent({ tenantId, context, onBack }: InventoryScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
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

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow="Operations"
        title="Inventory"
        description="Monitor stock and safely record physical inventory changes."
        icon="warehouse"
        action={
          state.status === "success" ? (
            <TextButton label="Refresh" icon="refresh" onPress={reload} />
          ) : undefined
        }
        onBack={onBack}
      />

      {concurrencyNotice ? (
        <Notice
          testID="inventory-concurrency-notice"
          tone="warning"
          title="Inventory changed"
          message="Inventory was refreshed from the server. Review the current on-hand quantity, then select the row and enter the physical count again before submitting a new adjustment."
          action={
            <PrimaryButton
              label="Review refreshed inventory"
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
          />
        </Surface>
      ) : null}

      {state.status === "loading" ? <LoadingBlock label="Loading inventory…" /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label="Try again" icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <EmptyState
          icon="package-variant-closed"
          title="Stock is empty"
          message="No inventory yet. Stock counted in this business will appear here."
        />
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <>
          <View style={inventoryStyles.metrics}>
            <MetricCard
              label="Stock rows"
              value={String(state.data.length)}
              icon="format-list-bulleted"
            />
            <MetricCard
              label="Locations shown"
              value={String(visibleLocationCount)}
              icon="map-marker-outline"
              tone="accent"
            />
          </View>

          <View style={inventoryStyles.catalogHeader}>
            <SectionHeading title="Stock overview" detail={`${visibleItems.length} shown`} />
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search product, SKU or location"
              testID="inventory-search"
            />
          </View>

          {visibleItems.length === 0 ? (
            <EmptyState
              icon="magnify"
              title="No matching stock"
              message="Try a different product, SKU or location."
            />
          ) : (
            <View style={inventoryStyles.list}>
              {visibleItems.map((item) => {
                const itemKey = `${item.inventoryLocationId}:${item.variantId}`;
                const locationName =
                  locationNameById.get(item.inventoryLocationId) ?? item.inventoryLocationId;
                return (
                  <SurfaceRow key={itemKey} testID={`inventory-row-${itemKey}`}>
                    <View style={inventoryStyles.stockIcon}>
                      <AppIcon name="hanger" size={22} color={colors.brand} />
                    </View>
                    <View style={inventoryStyles.stockCopy}>
                      <View style={inventoryStyles.stockTitleRow}>
                        <Text style={inventoryStyles.stockName}>{item.productName}</Text>
                        <Badge
                          label={String(item.onHand)}
                          tone={
                            item.onHand === 0 ? "danger" : item.onHand <= 5 ? "warning" : "success"
                          }
                          testID={`inventory-onhand-${itemKey}`}
                        />
                      </View>
                      <InfoRow label="SKU" value={item.sku} />
                      <View style={inventoryStyles.locationRow}>
                        <AppIcon name="map-marker-outline" size={17} color={colors.inkSubtle} />
                        <Body>{locationName}</Body>
                      </View>
                    </View>
                  </SurfaceRow>
                );
              })}
            </View>
          )}
        </>
      ) : null}
    </ScrollScreen>
  );
}

const inventoryStyles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  catalogHeader: { gap: spacing.md },
  list: { gap: spacing.md },
  stockIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  stockCopy: { flex: 1, gap: spacing.xs },
  stockName: { flex: 1, color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  stockTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  locationRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
