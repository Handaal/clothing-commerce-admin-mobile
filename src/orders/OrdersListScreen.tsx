import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n, type MessageKey } from "../i18n";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  EmptyState,
  FilterChips,
  HeaderIconButton,
  LoadingBlock,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ResponsiveList,
  ScrollScreen,
  SectionHeading,
  SummaryStrip,
} from "../ui/components";
import { AppIcon, type AppIconName } from "../ui/Icon";
import { colors, radius, spacing } from "../ui/theme";
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

function OrdersListContent({ tenantId, onOpenOrder }: Omit<OrdersListScreenProps, "onBack">) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const channelOptions = CHANNEL_META.map((meta) => ({
    value: meta.value,
    label: t(meta.labelKey),
    icon: meta.icon,
  }));
  const [channel, setChannel] = useState<OrderChannelFilter>("all");
  const load = useCallback(
    () => loadAllOrders(client, channel === "all" ? {} : { channel }),
    [client, channel],
  );
  const { state, reload } = useAsync<OrderListItem[]>(load);

  const channelCount = useMemo(
    () => (state.status === "success" ? new Set(state.data.map((order) => order.channel)).size : 0),
    [state],
  );

  return (
    <ScrollScreen wide>
      <PageHeader
        eyebrow={t("orders.eyebrow")}
        title={t("orders.title")}
        description={t("orders.headerDesc")}
        icon="receipt-text-outline"
        action={
          state.status === "success" && state.data.length > 0 ? (
            <HeaderIconButton
              label={t("orders.refresh")}
              icon="refresh"
              testID="refresh-orders-persistent"
              onPress={reload}
            />
          ) : undefined
        }
      />

      <Notice message={t("orders.readonlyNotice")} />

      <View style={orderStyles.filterBlock}>
        <SectionHeading
          title={t("orders.historyHeading")}
          detail={
            state.status === "success" ? t("common.shown", { count: state.data.length }) : undefined
          }
        />
        <FilterChips
          options={channelOptions}
          selected={channel}
          onSelect={setChannel}
          testIDPrefix="order-channel-filter"
        />
      </View>

      {state.status === "success" ? (
        <SummaryStrip
          testID="orders-summary"
          items={[
            {
              label: t("orders.loadedOrders"),
              value: String(state.data.length),
              icon: "receipt-text-check-outline",
            },
            {
              label: t("orders.channelsShown"),
              value: String(channelCount),
              icon: "source-branch",
              tone: "accent",
            },
          ]}
        />
      ) : null}

      {state.status === "loading" ? <LoadingBlock label={t("orders.loading")} /> : null}
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
          icon="receipt-text-outline"
          title={t("orders.emptyTitle")}
          message={
            channel === "all"
              ? t("orders.emptyAllBody")
              : t("orders.emptyFilteredBody", {
                  channel:
                    channel === "pos"
                      ? t("orderChannel.posInline")
                      : t("orderChannel.onlineInline"),
                })
          }
          action={
            channel === "all" ? (
              <PrimaryButton label={t("orders.refresh")} icon="refresh" onPress={reload} />
            ) : (
              <PrimaryButton
                label={t("orders.showAll")}
                icon="format-list-bulleted"
                onPress={() => setChannel("all")}
              />
            )
          }
        />
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <ResponsiveList>
          {state.data.map((order) => (
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
                    <Badge label={order.status} testID={`order-status-${order.id}`} />
                  </View>
                  <View style={orderStyles.metadataRow}>
                    <Text testID={`order-channel-${order.id}`} style={orderStyles.channelText}>
                      {order.channel.toUpperCase()}
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
  orderNumber: { flex: 1, color: colors.ink, fontSize: 16, lineHeight: 21, fontWeight: "800" },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  metadataRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  channelText: { color: colors.accent, fontSize: 10, lineHeight: 14, fontWeight: "800" },
  metadataDot: {
    width: 3,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
  },
  dateText: { flex: 1, color: colors.inkMuted, fontSize: 10, lineHeight: 14, fontWeight: "600" },
  totalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  totalLabel: { color: colors.inkSubtle, fontSize: 10, fontWeight: "700" },
  totalValue: { color: colors.ink, fontSize: 13, fontWeight: "800" },
});
