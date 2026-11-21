import type { OrderDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { ReturnHistory } from "../returns/ReturnHistory";
import { hasReturnActivity, returnedQuantityByLine } from "../returns/summary";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  StatusBadge,
  Body,
  DetailCard,
  Disclosure,
  HeaderIconButton,
  InfoRow,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
} from "../ui/components";
import { channelLabel } from "../ui/status";
import { AppIcon } from "../ui/Icon";
import { spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useAsync } from "../ui/useAsync";
import { formatOrderDate } from "./display";
import { OrderCustomerCard, OrderPaymentCard, OrderReservations } from "./OrderCommerce";
import { CustomerMessage } from "./CustomerMessage";
import { storeNameFor } from "./customer-message";
import { OrderOperations } from "./OrderOperations";
import { OrderReturnRequests } from "./OrderReturnRequests";
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
  /** When provided, offers starting a new return against this order. */
  onCreateReturn?: (orderId: string) => void;
}

/**
 * Detail for one commercial order snapshot. Online orders also offer staff fulfil / cancel when
 * `/me/context` advertises the grant (the API authorizes every request independently).
 */
export function OrderDetailScreen({
  tenantId,
  orderId,
  onBack,
  onOpenReturn,
  onCreateReturn,
}: OrderDetailScreenProps) {
  const { getTenantClient, state: session } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const load = useCallback(() => client.getOrder(orderId), [client, orderId]);
  const { state, reload } = useAsync<OrderDetailResponse>(load);
  // The detail returned by a fulfil / cancel, shown until the next explicit reload.
  const [updated, setUpdated] = useState<OrderDetailResponse | null>(null);
  const refresh = useCallback(() => {
    setUpdated(null);
    reload();
  }, [reload]);
  const orders = session.phase === "ready" ? session.context.access.orders : null;

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow={t("orders.title")} title={t("orderDetail.singular")} onBack={onBack} />
        <LoadingBlock label={t("orderDetail.loading")} />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("orders.title")}
          title={errorHeading(state.error.kind)}
          onBack={onBack}
        />
        <Notice
          tone="danger"
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      </ScrollScreen>
    );
  }

  return (
    <OrderDetail
      data={updated ?? state.data}
      client={client}
      canFulfill={Boolean(orders?.canRead && orders.canFulfill)}
      canCancel={Boolean(orders?.canRead && orders.canCancel)}
      onUpdated={setUpdated}
      storeName={storeNameFor(
        session.phase === "ready" ? session.context : null,
        (updated ?? state.data).header.brandId,
      )}
      canDecideReturns={Boolean(orders?.canRead)}
      onBack={onBack}
      onRefresh={refresh}
      onOpenReturn={onOpenReturn}
      onCreateReturn={onCreateReturn}
    />
  );
}

function OrderDetail({
  data,
  client,
  canFulfill,
  canCancel,
  onUpdated,
  storeName,
  canDecideReturns,
  onBack,
  onRefresh,
  onOpenReturn,
  onCreateReturn,
}: {
  data: OrderDetailResponse;
  client: Pick<
    TenantCommerceClient,
    | "listReturns"
    | "fulfillOrder"
    | "cancelOrder"
    | "listReturnRequests"
    | "updateReturnRequestStatus"
  >;
  storeName: string;
  canDecideReturns: boolean;
  canFulfill: boolean;
  canCancel: boolean;
  onUpdated: (detail: OrderDetailResponse) => void;
  onBack: () => void;
  onRefresh: () => void;
  onOpenReturn?: (returnId: string) => void;
  onCreateReturn?: (orderId: string) => void;
}) {
  const { detailStyles, colors } = useStyles();
  const { t } = useI18n();
  const { header, lines, cancellation, fulfillmentProgress } = data;
  const fulfillmentByLine = useMemo(
    () => fulfillmentByLineNumber(fulfillmentProgress),
    [fulfillmentProgress],
  );
  const returnedByLine = useMemo(() => returnedQuantityByLine(data.returns), [data.returns]);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const hasDeliveryFee =
    data.commerce?.deliveryFeeMinor !== undefined &&
    (data.commerce.deliveryFeeMinor > 0 || Boolean(data.commerce.delivery?.zoneCode));
  const showCommerce = header.channel === "online" || Boolean(data.commerce);

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("orders.title")}
        title={header.orderNumber}
        action={
          <HeaderIconButton
            label={t("orderDetail.refresh")}
            icon="refresh"
            variant="secondary"
            testID="order-refresh"
            onPress={onRefresh}
          />
        }
        onBack={onBack}
      />

      {/* 1. The one-glance summary: status, total, when, how far along. */}
      <DetailCard testID="order-summary">
        <View style={detailStyles.summaryTop}>
          <StatusBadge status={header.status} testID="order-detail-status" />
          <View style={detailStyles.channel}>
            <AppIcon
              name={header.channel === "online" ? "web" : "store-outline"}
              size={16}
              color={colors.inkMuted}
            />
            <Text style={detailStyles.channelText}>{channelLabel(header.channel, t)}</Text>
          </View>
        </View>
        <Text style={detailStyles.total}>
          {formatMoneyMinor(header.totalMinor, header.currency)}
        </Text>
        <Text style={detailStyles.meta}>
          {formatOrderDate(header.placedAt)} · {t("orderDetail.itemsCount", { count: itemCount })}
        </Text>
        <View style={detailStyles.summaryRows}>
          <View style={detailStyles.inlineRow}>
            <Text style={detailStyles.inlineLabel}>{t("orderDetail.fulfillment")}</Text>
            <Badge
              label={fulfillmentStatusLabel(fulfillmentProgress.status)}
              testID="order-fulfillment-status"
            />
          </View>
          {hasDeliveryFee && data.commerce ? (
            <InfoRow
              label={t("orderDetail.deliveryFee", {
                area: data.commerce.delivery?.region ?? data.commerce.delivery?.zoneCode ?? "",
              })}
              value={
                data.commerce.deliveryFeeMinor === 0
                  ? t("orderDetail.deliveryFree")
                  : formatMoneyMinor(data.commerce.deliveryFeeMinor ?? 0, header.currency)
              }
              testID="order-detail-delivery-fee"
            />
          ) : null}
        </View>
      </DetailCard>

      {/* 2. What can be done now. */}
      {header.channel === "online" ? (
        <OrderOperations
          key={`${header.id}-${header.status}-${fulfillmentProgress.status}`}
          data={data}
          client={client}
          canFulfill={canFulfill}
          canCancel={canCancel}
          onUpdated={onUpdated}
          onReload={onRefresh}
        />
      ) : null}

      {header.channel === "online" && header.status === "placed" ? (
        <CustomerMessage detail={data} storeName={storeName} />
      ) : null}

      {cancellation ? (
        <DetailCard title={t("orderDetail.cancellation")} testID="order-cancellation">
          <View>
            <InfoRow label={t("orderDetail.cancelled")} value={cancellation.cancelledAt} />
            {cancellation.reason ? (
              <InfoRow label={t("orderDetail.reason")} value={cancellation.reason} />
            ) : null}
          </View>
        </DetailCard>
      ) : null}

      {/* 3. What was bought — one compact row per line. */}
      <DetailCard title={t("orderDetail.itemsTitle", { count: lines.length })}>
        {lines.length === 0 ? (
          <Body>{t("orderDetail.noLinesMsg")}</Body>
        ) : (
          lines.map((line, index) => {
            const fulfillment = fulfillmentByLine.get(line.lineNumber);
            const returned = returnedByLine.get(line.lineNumber) ?? 0;
            const partlyFulfilled =
              fulfillment !== undefined &&
              fulfillmentProgress.status !== "unfulfilled" &&
              fulfillment.orderedQuantity > 0;
            return (
              <View
                key={line.lineNumber}
                testID={`order-line-${line.lineNumber}`}
                style={[detailStyles.line, index > 0 && detailStyles.lineDivided]}
              >
                <View style={detailStyles.lineMain}>
                  <Text numberOfLines={2} style={detailStyles.lineName}>
                    {line.productName}
                  </Text>
                  <Text style={detailStyles.lineTotal}>
                    {formatMoneyMinor(line.lineTotalMinor, header.currency)}
                  </Text>
                </View>
                {line.optionSummary || line.variantName ? (
                  <Text
                    testID={`order-line-variant-${line.lineNumber}`}
                    style={detailStyles.lineMetaText}
                  >
                    {line.optionSummary ?? line.variantName}
                  </Text>
                ) : null}
                <View style={detailStyles.lineMeta}>
                  <Text style={detailStyles.lineMetaText}>{line.sku}</Text>
                  <Text style={detailStyles.lineMetaText}>·</Text>
                  <Text style={detailStyles.lineMetaText}>{`× ${line.quantity}`}</Text>
                  <Text style={detailStyles.lineMetaText}>·</Text>
                  <Text style={detailStyles.lineMetaText}>
                    {formatMoneyMinor(line.unitPriceMinor, header.currency)}
                  </Text>
                </View>
                {partlyFulfilled || returned > 0 ? (
                  <View style={detailStyles.lineMeta}>
                    {partlyFulfilled && fulfillment ? (
                      <Text style={detailStyles.lineStatusText}>
                        {fulfillmentQuantityLabel(
                          fulfillment.fulfilledQuantity,
                          fulfillment.orderedQuantity,
                        )}
                      </Text>
                    ) : null}
                    {returned > 0 ? (
                      <>
                        <Text style={detailStyles.lineStatusText}>{t("orderDetail.returned")}</Text>
                        <Text style={detailStyles.lineStatusText}>{String(returned)}</Text>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </DetailCard>

      {/* 4. Who, where, how paid. */}
      {showCommerce ? <OrderCustomerCard data={data} /> : null}
      {showCommerce ? <OrderPaymentCard data={data} /> : null}

      {hasReturnActivity(data.returns) && data.returns ? (
        <DetailCard title={t("orderDetail.returnsRefunds")} testID="order-refunds">
          <View>
            <InfoRow
              label={t("orderDetail.pendingRefunds")}
              value={formatMoneyMinor(data.returns.pendingRefundMinor, header.currency)}
            />
            <InfoRow
              label={t("orderDetail.refunded")}
              value={formatMoneyMinor(data.returns.refundedMinor, header.currency)}
            />
          </View>
        </DetailCard>
      ) : null}

      {header.channel === "online" ? (
        <OrderReturnRequests orderId={header.id} client={client} canDecide={canDecideReturns} />
      ) : null}

      <ReturnHistory client={client} orderId={header.id} onOpenReturn={onOpenReturn} />

      {onCreateReturn ? (
        <PrimaryButton
          label={t("orderDetail.newReturn")}
          icon="keyboard-return"
          variant="secondary"
          testID="order-new-return"
          onPress={() => onCreateReturn(header.id)}
        />
      ) : null}

      {/* 5. Operational detail, one tap away. */}
      {showCommerce ? (
        <Disclosure label={t("common.moreDetails")} testID="order-more-details">
          <OrderReservations data={data} />
        </Disclosure>
      ) : null}
    </ScrollScreen>
  );
}

const useStyles = createThemedStyles((colors) => {
  const detailStyles = StyleSheet.create({
    summaryTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    channel: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    channelText: { color: colors.inkMuted, ...typography.caption, fontWeight: "700" },
    total: { color: colors.ink, ...typography.display, marginTop: spacing.sm },
    meta: { color: colors.inkMuted, ...typography.caption },
    summaryRows: { marginTop: spacing.sm },
    inlineRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSoft,
    },
    inlineLabel: { color: colors.inkMuted, ...typography.bodySmall, fontWeight: "600" },
    line: { gap: 2, paddingVertical: spacing.sm },
    lineDivided: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
    lineMain: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    lineName: { flex: 1, color: colors.ink, ...typography.bodySmall, fontWeight: "700" },
    lineTotal: { color: colors.ink, ...typography.bodySmall, fontWeight: "800" },
    lineMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
    lineMetaText: { color: colors.inkMuted, ...typography.caption },
    lineStatusText: { color: colors.accent, ...typography.caption, fontWeight: "700" },
  });
  return { colors, detailStyles };
});
