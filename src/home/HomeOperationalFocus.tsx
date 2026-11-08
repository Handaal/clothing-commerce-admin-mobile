import type { OrderListResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { directionalIcon, endAlign, useI18n } from "../i18n";
import { loadAllInventory, type InventoryItem } from "../inventory/load";
import { formatOrderDate } from "../orders/display";
import { formatMoneyMinor } from "../products/display";
import type { SupplierAdapter } from "../suppliers/adapter";
import type { SupplierDue } from "../suppliers/ledger";
import {
  Divider,
  LoadingBlock,
  SectionHeading,
  Surface,
  TextButton,
  webLift,
} from "../ui/components";
import { AppIcon, type AppIconName } from "../ui/Icon";
import { colors, radius, spacing, typography } from "../ui/theme";
import { useAsync, type AsyncState } from "../ui/useAsync";

const LOW_STOCK_DISPLAY_THRESHOLD = 5;
const HOME_LIST_LIMIT = 3;

interface HomeOperationalFocusProps {
  client: TenantCommerceClient;
  canReadOrders: boolean;
  canReadInventory: boolean;
  supplierAdapter: SupplierAdapter | null;
  onOpenOrder: (orderId: string) => void;
  onOpenOrders: () => void;
  onOpenInventory: () => void;
  onOpenSupplier: (supplierId: string) => void;
  onOpenSuppliers: () => void;
}

interface PlacedOrdersSnapshot {
  items: OrderListResponse["items"];
  hasMore: boolean;
}

/**
 * Compact operational signals for the owner dashboard. Every value comes from an existing SDK read;
 * the low-stock threshold is explicitly presentation-only and never becomes an inventory rule.
 */
export function HomeOperationalFocus({
  client,
  canReadOrders,
  canReadInventory,
  supplierAdapter,
  onOpenOrder,
  onOpenOrders,
  onOpenInventory,
  onOpenSupplier,
  onOpenSuppliers,
}: HomeOperationalFocusProps) {
  const { t } = useI18n();
  const loadPlacedOrders = useCallback(async (): Promise<PlacedOrdersSnapshot> => {
    if (!canReadOrders) return { items: [], hasMore: false };
    const response = await client.listOrders({ status: "placed", limit: HOME_LIST_LIMIT });
    return { items: response.items, hasMore: response.pageInfo.hasMore };
  }, [canReadOrders, client]);
  const loadInventory = useCallback(
    () => (canReadInventory ? loadAllInventory(client) : Promise.resolve<InventoryItem[]>([])),
    [canReadInventory, client],
  );
  const loadSupplierDues = useCallback(
    () => (supplierAdapter ? supplierAdapter.supplierDues() : Promise.resolve<SupplierDue[]>([])),
    [supplierAdapter],
  );

  const orders = useAsync(loadPlacedOrders);
  const inventory = useAsync(loadInventory);
  const dues = useAsync(loadSupplierDues);

  const hasAnyDomain = canReadOrders || canReadInventory || supplierAdapter !== null;
  if (!hasAnyDomain) return null;

  return (
    <View style={styles.section}>
      <SectionHeading title={t("home.operationalFocus")} detail={t("home.liveFromApi")} />
      <Surface style={styles.focusSurface}>
        {canReadOrders ? (
          <OperationalGroup
            icon="receipt-text-outline"
            title={t("home.placedOrders")}
            actionLabel={t("home.viewAllOrders")}
            onAction={onOpenOrders}
          >
            <OrdersContent state={orders.state} onOpenOrder={onOpenOrder} />
          </OperationalGroup>
        ) : null}

        {canReadOrders && canReadInventory ? <Divider style={styles.divider} /> : null}

        {canReadInventory ? (
          <OperationalGroup
            icon="package-variant-closed"
            title={t("home.lowStockCue")}
            actionLabel={t("home.openInventory")}
            onAction={onOpenInventory}
          >
            <InventoryContent state={inventory.state} />
          </OperationalGroup>
        ) : null}

        {(canReadOrders || canReadInventory) && supplierAdapter ? (
          <Divider style={styles.divider} />
        ) : null}

        {supplierAdapter ? (
          <OperationalGroup
            icon="truck-outline"
            title={t("home.supplierDues")}
            actionLabel={t("home.openSuppliers")}
            onAction={onOpenSuppliers}
          >
            <SupplierDuesContent state={dues.state} onOpenSupplier={onOpenSupplier} />
          </OperationalGroup>
        ) : null}
      </Surface>
    </View>
  );
}

function OperationalGroup({
  icon,
  title,
  actionLabel,
  onAction,
  children,
}: {
  icon: AppIconName;
  title: string;
  actionLabel: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  const { isRTL } = useI18n();
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <View style={styles.groupTitleRow}>
          <View style={styles.groupIcon}>
            <AppIcon name={icon} size={18} color={colors.brand} />
          </View>
          <Text style={styles.groupTitle}>{title}</Text>
        </View>
        <TextButton
          label={actionLabel}
          icon={directionalIcon("arrow-right", isRTL)}
          onPress={onAction}
        />
      </View>
      {children}
    </View>
  );
}

function OrdersContent({
  state,
  onOpenOrder,
}: {
  state: AsyncState<PlacedOrdersSnapshot>;
  onOpenOrder: (orderId: string) => void;
}) {
  const { t } = useI18n();
  if (state.status === "loading") return <LoadingBlock label={t("home.loadingPlacedOrders")} />;
  if (state.status === "error") return <CompactUnavailable />;
  if (state.data.items.length === 0) {
    return <CompactEmpty message={t("home.noPlacedOrders")} />;
  }
  return (
    <View style={styles.compactList}>
      {state.data.items.slice(0, HOME_LIST_LIMIT).map((order) => (
        <CompactPressableRow
          key={order.id}
          testID={`home-order-${order.id}`}
          title={order.orderNumber}
          detail={t("home.orderMeta", {
            channel: order.channel.toUpperCase(),
            date: formatOrderDate(order.placedAt),
          })}
          trailing={formatMoneyMinor(order.totalMinor, order.currency)}
          onPress={() => onOpenOrder(order.id)}
        />
      ))}
      {state.data.hasMore ? (
        <Text style={styles.moreHint}>{t("home.morePlacedOrders")}</Text>
      ) : null}
    </View>
  );
}

function InventoryContent({ state }: { state: AsyncState<InventoryItem[]> }) {
  const { t } = useI18n();
  if (state.status === "loading") return <LoadingBlock label={t("home.loadingLowStock")} />;
  if (state.status === "error") return <CompactUnavailable />;
  const lowStock = state.data
    .filter((item) => item.onHand <= LOW_STOCK_DISPLAY_THRESHOLD)
    .sort((left, right) => left.onHand - right.onHand)
    .slice(0, HOME_LIST_LIMIT);
  if (lowStock.length === 0) return <CompactEmpty message={t("home.noLowStockRows")} />;
  return (
    <View style={styles.compactList}>
      {lowStock.map((item) => (
        <View key={`${item.inventoryLocationId}:${item.variantId}`} style={styles.compactRow}>
          <View style={styles.rowCopy}>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {item.productName}
            </Text>
            <Text numberOfLines={1} style={styles.rowDetail}>
              {item.sku}
            </Text>
          </View>
          <Text style={[styles.rowTrailing, item.onHand === 0 && styles.rowTrailingDanger]}>
            {t("home.unitsRemaining", { count: item.onHand })}
          </Text>
        </View>
      ))}
      <Text style={styles.thresholdNote}>{t("home.lowStockThresholdNote")}</Text>
    </View>
  );
}

function SupplierDuesContent({
  state,
  onOpenSupplier,
}: {
  state: AsyncState<SupplierDue[]>;
  onOpenSupplier: (supplierId: string) => void;
}) {
  const { t } = useI18n();
  if (state.status === "loading") return <LoadingBlock label={t("home.loadingSupplierDues")} />;
  if (state.status === "error") return <CompactUnavailable />;
  const outstanding = state.data
    .filter((due) => due.outstandingMinor > 0)
    .sort((left, right) => right.outstandingMinor - left.outstandingMinor)
    .slice(0, HOME_LIST_LIMIT);
  if (outstanding.length === 0) return <CompactEmpty message={t("home.noSupplierDues")} />;
  return (
    <View style={styles.compactList}>
      {outstanding.map((due) => (
        <CompactPressableRow
          key={`${due.supplierId}:${due.currency}`}
          testID={`home-supplier-due-${due.supplierId}`}
          title={due.supplierName}
          detail={due.supplierCode ?? t("home.supplierBalance")}
          trailing={formatMoneyMinor(due.outstandingMinor, due.currency)}
          onPress={() => onOpenSupplier(due.supplierId)}
        />
      ))}
      <Text style={styles.thresholdNote}>{t("home.currenciesSeparate")}</Text>
    </View>
  );
}

function CompactPressableRow({
  testID,
  title,
  detail,
  trailing,
  onPress,
}: {
  testID: string;
  title: string;
  detail: string;
  trailing: string;
  onPress: () => void;
}) {
  const { isRTL, dir } = useI18n();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      {...webLift}
      style={({ pressed }) => [styles.compactRow, { direction: dir }, pressed && styles.pressed]}
    >
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.rowDetail}>
          {detail}
        </Text>
      </View>
      <Text style={[styles.rowTrailing, { textAlign: endAlign(isRTL) }]}>{trailing}</Text>
      <AppIcon name={directionalIcon("chevron-right", isRTL)} size={19} color={colors.inkSubtle} />
    </Pressable>
  );
}

function CompactEmpty({ message }: { message: string }) {
  return (
    <View style={styles.compactMessage}>
      <AppIcon name="check-circle-outline" size={18} color={colors.success} />
      <Text style={styles.compactMessageText}>{message}</Text>
    </View>
  );
}

function CompactUnavailable() {
  const { t } = useI18n();
  return (
    <View style={styles.compactMessage}>
      <AppIcon name="cloud-alert-outline" size={18} color={colors.warning} />
      <Text style={styles.compactMessageText}>{t("home.signalUnavailable")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  focusSurface: { paddingVertical: spacing.sm, gap: 0 },
  group: { gap: spacing.xs },
  groupHeader: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  groupTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  groupIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  groupTitle: { color: colors.ink, ...typography.cardTitle },
  divider: { marginVertical: spacing.sm },
  compactList: { gap: 0 },
  compactRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { color: colors.ink, fontSize: 14, lineHeight: 19, fontWeight: "800" },
  rowDetail: { color: colors.inkMuted, fontSize: 11, lineHeight: 15, fontWeight: "600" },
  rowTrailing: { color: colors.ink, fontSize: 12, fontWeight: "800" },
  rowTrailingDanger: { color: colors.danger },
  compactMessage: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  compactMessageText: { flex: 1, color: colors.inkMuted, ...typography.caption },
  thresholdNote: { color: colors.inkSubtle, fontSize: 10, lineHeight: 15, fontWeight: "600" },
  moreHint: { color: colors.inkSubtle, fontSize: 10, lineHeight: 15, fontWeight: "700" },
  pressed: { opacity: 0.72 },
});
