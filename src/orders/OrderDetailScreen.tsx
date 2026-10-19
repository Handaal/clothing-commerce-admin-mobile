import type { OrderDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { ReturnHistory } from "../returns/ReturnHistory";
import { hasReturnActivity, returnedQuantityByLine } from "../returns/summary";
import { useSession } from "../session/SessionProvider";
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
  SectionHeading,
  Surface,
  TextButton,
} from "../ui/components";
import { AppIcon } from "../ui/Icon";
import { colors, radius, spacing } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { formatOrderDate } from "./display";
import { OrderCommerce } from "./OrderCommerce";
import {
  fulfillmentByLineNumber,
  fulfillmentQuantityLabel,
  fulfillmentStatusLabel,
} from "./fulfillment";

export interface OrderDetailScreenProps {
  tenantId: string;
  orderId: string;
  onBack: () => void;
  onOpenReturn?: (returnId: string) => void;
}

/** Read-only detail for one immutable commercial order snapshot. */
export function OrderDetailScreen({
  tenantId,
  orderId,
  onBack,
  onOpenReturn,
}: OrderDetailScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const load = useCallback(() => client.getOrder(orderId), [client, orderId]);
  const { state, reload } = useAsync<OrderDetailResponse>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow="Orders"
          title="Order"
          description="Loading the latest server-authoritative order state."
          icon="receipt-text-outline"
          onBack={onBack}
        />
        <LoadingBlock label="Loading order…" />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow="Orders"
          title={errorHeading(state.error.kind)}
          icon="receipt-text-outline"
          onBack={onBack}
        />
        <Notice
          tone="danger"
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label="Try again" icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      </ScrollScreen>
    );
  }

  return (
    <OrderDetail
      data={state.data}
      client={client}
      onBack={onBack}
      onRefresh={reload}
      onOpenReturn={onOpenReturn}
    />
  );
}

function OrderDetail({
  data,
  client,
  onBack,
  onRefresh,
  onOpenReturn,
}: {
  data: OrderDetailResponse;
  client: Pick<TenantCommerceClient, "listReturns">;
  onBack: () => void;
  onRefresh: () => void;
  onOpenReturn?: (returnId: string) => void;
}) {
  const { header, lines, cancellation, fulfillmentProgress } = data;
  const fulfillmentByLine = useMemo(
    () => fulfillmentByLineNumber(fulfillmentProgress),
    [fulfillmentProgress],
  );
  const returnedByLine = useMemo(() => returnedQuantityByLine(data.returns), [data.returns]);

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow="Order record"
        title={header.orderNumber}
        description="Commercial, payment and fulfillment facts recorded by the Commerce API."
        icon="receipt-text-outline"
        action={<TextButton label="Refresh order" icon="refresh" onPress={onRefresh} />}
        onBack={onBack}
      />

      <Surface tone="brand">
        <View style={detailStyles.summaryHeader}>
          <View
            style={[
              detailStyles.channelIcon,
              header.channel === "online" && detailStyles.channelIconOnline,
            ]}
          >
            <AppIcon
              name={header.channel === "online" ? "web" : "store-outline"}
              size={25}
              color={header.channel === "online" ? colors.accent : colors.brand}
            />
          </View>
          <View style={detailStyles.summaryCopy}>
            <Text style={detailStyles.cardTitle}>Order summary</Text>
            <View style={detailStyles.badges}>
              <Badge label={header.status} testID="order-detail-status" />
              <Badge label={header.channel.toUpperCase()} tone="brand" />
            </View>
          </View>
        </View>
        <InfoRow label="Total" value={formatMoneyMinor(header.totalMinor, header.currency)} />
        <InfoRow label="Placed" value={formatOrderDate(header.placedAt)} />
      </Surface>

      <View style={detailStyles.metrics}>
        <MetricCard label="Order lines" value={String(lines.length)} icon="format-list-numbered" />
        <MetricCard
          label="Fulfillment"
          value={fulfillmentStatusLabel(fulfillmentProgress.status)}
          icon="truck-check-outline"
          tone="accent"
        />
      </View>

      <Notice message="This is a read-only management record. Refresh to retrieve updated payment, fulfillment, reservation and return facts." />

      {header.channel === "online" || data.commerce ? <OrderCommerce data={data} /> : null}

      {cancellation ? (
        <Surface>
          <SectionHeading title="Cancellation" detail="Terminal state" />
          <InfoRow label="Cancelled" value={cancellation.cancelledAt} />
          {cancellation.reason ? <InfoRow label="Reason" value={cancellation.reason} /> : null}
        </Surface>
      ) : null}

      <SectionHeading title={`Order lines (${lines.length})`} detail="Immutable sale snapshot" />
      {lines.length === 0 ? (
        <EmptyState
          icon="format-list-bulleted"
          title="No order lines"
          message="This order has no lines."
        />
      ) : (
        <View style={detailStyles.lineList}>
          {lines.map((line) => {
            const fulfillment = fulfillmentByLine.get(line.lineNumber);
            const returned = returnedByLine.get(line.lineNumber) ?? 0;
            return (
              <Surface key={line.lineNumber} testID={`order-line-${line.lineNumber}`}>
                <View style={detailStyles.lineHeader}>
                  <View style={detailStyles.lineIcon}>
                    <AppIcon name="hanger" size={21} color={colors.brand} />
                  </View>
                  <View style={detailStyles.lineTitle}>
                    <Text style={detailStyles.cardTitle}>{line.productName}</Text>
                    <Body>{line.sku}</Body>
                  </View>
                  <Badge label={`× ${line.quantity}`} tone="brand" />
                </View>
                <InfoRow
                  label="Unit price"
                  value={formatMoneyMinor(line.unitPriceMinor, header.currency)}
                />
                <InfoRow
                  label="Line total"
                  value={formatMoneyMinor(line.lineTotalMinor, header.currency)}
                />
                {fulfillment ? (
                  <InfoRow
                    label="Fulfilled"
                    value={fulfillmentQuantityLabel(
                      fulfillment.fulfilledQuantity,
                      fulfillment.orderedQuantity,
                    )}
                  />
                ) : null}
                {returned > 0 ? <InfoRow label="Returned" value={String(returned)} /> : null}
              </Surface>
            );
          })}
        </View>
      )}

      <Surface tone="accent">
        <View style={detailStyles.sectionLead}>
          <View style={detailStyles.accentIcon}>
            <AppIcon name="truck-check-outline" size={22} color={colors.accent} />
          </View>
          <View style={detailStyles.summaryCopy}>
            <Text style={detailStyles.cardTitle}>Fulfillment</Text>
            <Body>Current progress reported by the server.</Body>
          </View>
        </View>
        <Badge
          label={fulfillmentStatusLabel(fulfillmentProgress.status)}
          testID="order-fulfillment-status"
        />
      </Surface>

      {hasReturnActivity(data.returns) && data.returns ? (
        <Surface>
          <SectionHeading title="Returns & refunds" detail="Read-only" />
          <InfoRow
            label="Pending refunds"
            value={formatMoneyMinor(data.returns.pendingRefundMinor, header.currency)}
          />
          <InfoRow
            label="Refunded"
            value={formatMoneyMinor(data.returns.refundedMinor, header.currency)}
          />
        </Surface>
      ) : null}

      <ReturnHistory client={client} orderId={header.id} onOpenReturn={onOpenReturn} />
    </ScrollScreen>
  );
}

const detailStyles = StyleSheet.create({
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  summaryCopy: { flex: 1, gap: spacing.sm },
  cardTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
  channelIcon: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  channelIconOnline: { backgroundColor: colors.accentSoft },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  lineList: { gap: spacing.md },
  lineHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  lineIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  lineTitle: { flex: 1, gap: spacing.xs },
  sectionLead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  accentIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
});
