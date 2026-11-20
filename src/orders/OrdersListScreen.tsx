import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n, type MessageKey } from "../i18n";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  StatusBadge,
  EmptyState,
  FilterChips,
  HeaderIconButton,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ReadOnlyChip,
  ResponsiveList,
  ScrollScreen,
  SearchField,
  SectionHeading,
  SkeletonRows,
} from "../ui/components";
import { channelLabel } from "../ui/status";
import { AppIcon, type AppIconName } from "../ui/Icon";
import { radius, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useAsync } from "../ui/useAsync";
import { formatOrderDate } from "./display";
import { loadAllOrders, type OrderListItem } from "./load";

export interface OrdersListScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onOpenOrder: (orderId: string) => void;
  onBack?: () => void;
}

type OrderChannelFilter = "all" | "pos" | "online";

const CHANNEL_META = [
  { value: "all", labelKey: "orderChannel.all", icon: "format-list-bulleted" },
  { value: "pos", labelKey: "orderChannel.pos", icon: "store-outline" },
  { value: "online", labelKey: "orderChannel.online", icon: "web" },
] as const satisfies readonly {
  value: OrderChannelFilter;
  labelKey: MessageKey;
  icon: AppIconName;
}[];

/** Read-only order visibility across every authorized sales channel. */
export function OrdersListScreen({ tenantId, context, onOpenOrder }: OrdersListScreenProps) {
  const { t } = useI18n();
  if (!context.access.orders.canRead) {
    return (
      <ScrollScreen wide>
        <PageHeader
          eyebrow={t("orders.eyebrow")}
          title={t("orders.title")}
          description={t("orders.headerNoAccessDesc")}
          icon="receipt-text-outline"
        />
        <Notice tone="warning" title={t("orders.accessTitle")} message={t("orders.accessBody")} />
      </ScrollScreen>
    );
  }

  return <OrdersListContent tenantId={tenantId} context={context} onOpenOrder={onOpenOrder} />;
}

function OrdersListContent({
  tenantId,
  context,
  onOpenOrder,
}: Omit<OrdersListScreenProps, "onBack">) {
  const { orderStyles, colors } = useStyles();
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const [channel, setChannel] = useState<OrderChannelFilter>("all");
  const [query, setQuery] = useState("");
  // Load the full set once; channel + search filtering happen client-side so switching is instant and
  // the chip counts stay accurate across channels.
  const load = useCallback(() => loadAllOrders(client, {}), [client]);
  const { state, reload, refresh, refreshing } = useAsync<OrderListItem[]>(load);

  const allOrders = useMemo(() => (state.status === "success" ? state.data : []), [state]);
  const channelCounts = useMemo(() => {
    let pos = 0;
    let online = 0;
    for (const order of allOrders) {
      if (order.channel === "online") online += 1;
      else pos += 1;
    }
    return { all: allOrders.length, pos, online };
  }, [allOrders]);

  const channelOptions = CHANNEL_META.map((meta) => ({
    value: meta.value,
    label: t(meta.labelKey),
    icon: meta.icon,
    count: channelCounts[meta.value],
  }));

  const normalizedQuery = query.trim().toLowerCase();
  const visibleOrders = useMemo(() => {
    const byChannel =
      channel === "all" ? allOrders : allOrders.filter((order) => order.channel === channel);
    if (!normalizedQuery) return byChannel;
    return byChannel.filter((order) => order.orderNumber.toLowerCase().includes(normalizedQuery));
  }, [allOrders, channel, normalizedQuery]);

  return (
    <ScrollScreen wide onRefresh={refresh} refreshing={refreshing}>
      <PageHeader
        eyebrow={t("orders.eyebrow")}
        title={t("orders.title")}
        description={t("orders.headerDesc")}
        icon="receipt-text-outline"
        action={
          state.status === "success" && allOrders.length > 0 ? (
            <HeaderIconButton
              label={t("orders.refresh")}
              icon="refresh"
              testID="refresh-orders-persistent"
              onPress={refresh}
            />
          ) : undefined
        }
      />

      {/* Online orders can be fulfilled/cancelled from their detail page, so "View only" is shown
          only when this account can do neither. */}
      {context.access.orders.canFulfill || context.access.orders.canCancel ? null : (
        <ReadOnlyChip testID="orders-readonly" label={t("orders.readonlyChip")} />
      )}

      {state.status === "success" && allOrders.length > 0 ? (
        <SearchField
          testID="orders-search"
          value={query}
          onChangeText={setQuery}
          placeholder={t("orders.searchPlaceholder")}
        />
      ) : null}

      <View style={orderStyles.filterBlock}>
        <SectionHeading
          title={t("orders.historyHeading")}
          detail={
            state.status === "success"
              ? t("common.shown", { count: visibleOrders.length })
              : undefined
          }
        />
        <FilterChips
          options={channelOptions}
          selected={channel}
          onSelect={setChannel}
          testIDPrefix="order-channel-filter"
        />
      </View>

      {state.status === "loading" ? <SkeletonRows testID="orders-loading" /> : null}
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
      {state.status === "success" &&
      allOrders.length > 0 &&
      visibleOrders.length === 0 &&
      normalizedQuery ? (
        <EmptyState
          icon="magnify"
          title={t("common.noResultsTitle")}
          message={t("common.noResultsBody", { query: query.trim() })}
          action={
            <PrimaryButton
              label={t("common.clearSearch")}
              icon="close"
              onPress={() => setQuery("")}
            />
          }
        />
      ) : null}
      {state.status === "success" &&
      allOrders.length > 0 &&
      visibleOrders.length === 0 &&
      !normalizedQuery ? (
        <EmptyState
          icon="receipt-text-outline"
          title={t("orders.emptyTitle")}
          message={t("orders.emptyFilteredBody", {
            channel:
              channel === "pos" ? t("orderChannel.posInline") : t("orderChannel.onlineInline"),
          })}
          action={
            <PrimaryButton
              label={t("orders.showAll")}
              icon="format-list-bulleted"
              onPress={() => setChannel("all")}
            />
          }
        />
      ) : null}
      {state.status === "success" && allOrders.length === 0 ? (
        <EmptyState
          icon="receipt-text-outline"
          title={t("orders.emptyTitle")}
          message={t("orders.emptyAllBody")}
          action={<PrimaryButton label={t("orders.refresh")} icon="refresh" onPress={refresh} />}
        />
      ) : null}
      {state.status === "success" && visibleOrders.length > 0 ? (
        <ResponsiveList>
          {visibleOrders.map((order) => (
            <PressableRow
              key={order.id}
              testID={`order-row-${order.id}`}
              onPress={() => onOpenOrder(order.id)}
              density="compact"
            >
              <View style={orderStyles.orderLead}>
                <View
                  style={[
                    orderStyles.channelIcon,
                    order.channel === "online" && orderStyles.channelIconOnline,
                  ]}
                >
                  <AppIcon
                    name={order.channel === "online" ? "web" : "store-outline"}
                    size={22}
                    color={order.channel === "online" ? colors.accent : colors.brand}
                  />
                </View>
                <View style={orderStyles.orderCopy}>
                  <View style={orderStyles.titleRow}>
                    <Text style={orderStyles.orderNumber}>{order.orderNumber}</Text>
                    <StatusBadge status={order.status} testID={`order-status-${order.id}`} />
                  </View>
                  <View style={orderStyles.metadataRow}>
                    <Text testID={`order-channel-${order.id}`} style={orderStyles.channelText}>
                      {channelLabel(order.channel, t).toUpperCase()}
                    </Text>
                    <View style={orderStyles.metadataDot} />
                    <AppIcon name="clock-outline" size={14} color={colors.inkSubtle} />
                    <Text numberOfLines={1} style={orderStyles.dateText}>
                      {formatOrderDate(order.placedAt)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={orderStyles.totalRow}>
                <Text style={orderStyles.totalLabel}>{t("orders.total")}</Text>
                <Text style={orderStyles.totalValue}>
                  {formatMoneyMinor(order.totalMinor, order.currency)}
                </Text>
              </View>
            </PressableRow>
          ))}
        </ResponsiveList>
      ) : null}
    </ScrollScreen>
  );
}

const useStyles = createThemedStyles((colors) => {
  const orderStyles = StyleSheet.create({
    filterBlock: { gap: spacing.sm },
    orderLead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    channelIcon: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    channelIconOnline: { backgroundColor: colors.accentSoft },
    orderCopy: { flex: 1, minWidth: 0, gap: spacing.xs },
    orderNumber: { flex: 1, color: colors.ink, ...typography.cardTitle, fontWeight: "800" },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.sm,
    },
    metadataRow: { flexDirection: "row", alignItems: "center", gap: 5 },
    channelText: { color: colors.accent, ...typography.micro, fontWeight: "800" },
    metadataDot: {
      width: 3,
      height: 3,
      borderRadius: radius.pill,
      backgroundColor: colors.borderStrong,
    },
    dateText: { flex: 1, color: colors.inkMuted, ...typography.micro, fontWeight: "600" },
    totalRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    totalLabel: { color: colors.inkSubtle, ...typography.micro, fontWeight: "700" },
    totalValue: { flexShrink: 1, color: colors.ink, ...typography.label, fontWeight: "800" },
  });
  return { colors, orderStyles };
});
