import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  EmptyState,
  FilterChips,
  InfoRow,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  TextButton,
} from "../ui/components";
import { AppIcon } from "../ui/Icon";
import { colors, radius, spacing } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { formatOrderDate } from "./display";
import { loadAllOrders, type OrderListItem } from "./load";

export interface OrdersListScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onOpenOrder: (orderId: string) => void;
  onBack: () => void;
}

type OrderChannelFilter = "all" | "pos" | "online";

const channelOptions = [
  { value: "all", label: "All", icon: "format-list-bulleted" },
  { value: "pos", label: "POS", icon: "store-outline" },
  { value: "online", label: "Online", icon: "web" },
] as const;

/** Read-only order visibility across every authorized sales channel. */
export function OrdersListScreen({
  tenantId,
  context,
  onOpenOrder,
  onBack,
}: OrdersListScreenProps) {
  if (!context.access.orders.canRead) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow="Sales visibility"
          title="Orders"
          description="Review orders placed through POS and online channels."
          icon="receipt-text-outline"
          onBack={onBack}
        />
        <Notice
          tone="warning"
          title="Order access required"
          message="You do not have read access to orders. Ask an owner or administrator."
        />
      </ScrollScreen>
    );
  }

  return (
    <OrdersListContent
      tenantId={tenantId}
      context={context}
      onOpenOrder={onOpenOrder}
      onBack={onBack}
    />
  );
}

function OrdersListContent({ tenantId, onOpenOrder, onBack }: OrdersListScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
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
    <ScrollScreen>
      <PageHeader
        eyebrow="Sales visibility"
        title="Orders"
        description="Track placed orders, payments and fulfillment status without changing the sale."
        icon="receipt-text-outline"
        action={
          state.status === "success" ? (
            <TextButton label="Refresh orders" icon="refresh" onPress={reload} />
          ) : undefined
        }
        onBack={onBack}
      />

      <Notice message="Orders are read-only in the management app. Selling, payment capture and fulfillment actions remain outside this channel." />

      {state.status === "success" ? (
        <View style={orderStyles.metrics}>
          <MetricCard
            label="Loaded orders"
            value={String(state.data.length)}
            icon="receipt-text-check-outline"
          />
          <MetricCard
            label="Channels shown"
            value={String(channelCount)}
            icon="source-branch"
            tone="accent"
          />
        </View>
      ) : null}

      <View style={orderStyles.filterBlock}>
        <SectionHeading
          title="Order history"
          detail={state.status === "success" ? `${state.data.length} shown` : undefined}
        />
        <FilterChips
          options={channelOptions}
          selected={channel}
          onSelect={setChannel}
          testIDPrefix="order-channel-filter"
        />
      </View>

      {state.status === "loading" ? <LoadingBlock label="Loading orders…" /> : null}
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
          icon="receipt-text-outline"
          title="No matching orders"
          message={
            channel === "all"
              ? "No orders yet. Orders placed in this business will appear here."
              : `No ${channel === "pos" ? "POS" : "online"} orders found.`
          }
        />
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <View style={orderStyles.list}>
          {state.data.map((order) => (
            <PressableRow
              key={order.id}
              testID={`order-row-${order.id}`}
              onPress={() => onOpenOrder(order.id)}
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
                  <View style={orderStyles.badgeRow}>
                    <Badge
                      label={order.channel.toUpperCase()}
                      testID={`order-channel-${order.id}`}
                      tone="brand"
                    />
                  </View>
                </View>
              </View>
              <InfoRow label="Total" value={formatMoneyMinor(order.totalMinor, order.currency)} />
              <View style={orderStyles.placedRow}>
                <AppIcon name="clock-outline" size={16} color={colors.inkSubtle} />
                <Body>{formatOrderDate(order.placedAt)}</Body>
              </View>
            </PressableRow>
          ))}
        </View>
      ) : null}
    </ScrollScreen>
  );
}

const orderStyles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  filterBlock: { gap: spacing.sm },
  list: { gap: spacing.md },
  orderLead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  channelIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  channelIconOnline: { backgroundColor: colors.accentSoft },
  orderCopy: { flex: 1, gap: spacing.sm },
  orderNumber: { flex: 1, color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  badgeRow: { flexDirection: "row" },
  placedRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
