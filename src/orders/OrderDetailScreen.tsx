import type { OrderDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
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
  /** When provided, offers starting a new return against this order. */
  onCreateReturn?: (orderId: string) => void;
}

/** Read-only detail for one immutable commercial order snapshot. */
export function OrderDetailScreen({
  tenantId,
  orderId,
  onBack,
  onOpenReturn,
  onCreateReturn,
}: OrderDetailScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const load = useCallback(() => client.getOrder(orderId), [client, orderId]);
  const { state, reload } = useAsync<OrderDetailResponse>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("orders.title")}
          title={t("orderDetail.singular")}
          description={t("orderDetail.loadingDesc")}
          icon="receipt-text-outline"
          onBack={onBack}
        />
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
          icon="receipt-text-outline"
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
      data={state.data}
      client={client}
      onBack={onBack}
      onRefresh={reload}
      onOpenReturn={onOpenReturn}
      onCreateReturn={onCreateReturn}
    />
  );
}

function OrderDetail({
  data,
  client,
  onBack,
  onRefresh,
  onOpenReturn,
  onCreateReturn,
}: {
  data: OrderDetailResponse;
  client: Pick<TenantCommerceClient, "listReturns">;
  onBack: () => void;
  onRefresh: () => void;
  onOpenReturn?: (returnId: string) => void;
  onCreateReturn?: (orderId: string) => void;
}) {
  const { t } = useI18n();
  const { header, lines, cancellation, fulfillmentProgress } = data;
  const fulfillmentByLine = useMemo(
    () => fulfillmentByLineNumber(fulfillmentProgress),
    [fulfillmentProgress],
  );
  const returnedByLine = useMemo(() => returnedQuantityByLine(data.returns), [data.returns]);

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("orderDetail.recordEyebrow")}
        title={header.orderNumber}
        description={t("orderDetail.recordDesc")}
        icon="receipt-text-outline"
        action={<TextButton label={t("orderDetail.refresh")} icon="refresh" onPress={onRefresh} />}
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
            <Text style={detailStyles.cardTitle}>{t("orderDetail.summary")}</Text>
            <View style={detailStyles.badges}>
              <Badge label={header.status} testID="order-detail-status" />
              <Badge label={header.channel.toUpperCase()} tone="brand" />
            </View>
          </View>
        </View>
        <InfoRow
          label={t("orders.total")}
          value={formatMoneyMinor(header.totalMinor, header.currency)}
        />
        <InfoRow label={t("orderDetail.placed")} value={formatOrderDate(header.placedAt)} />
      </Surface>

      <View style={detailStyles.metrics}>
        <MetricCard
          label={t("orderDetail.orderLines")}
          value={String(lines.length)}
          icon="format-list-numbered"
        />
        <MetricCard
          label={t("orderDetail.fulfillment")}
          value={fulfillmentStatusLabel(fulfillmentProgress.status)}
          icon="truck-check-outline"
          tone="accent"
        />
      </View>

      <Notice message={t("orderDetail.readonlyNotice")} />

      {header.channel === "online" || data.commerce ? <OrderCommerce data={data} /> : null}

      {cancellation ? (
        <Surface>
          <SectionHeading
            title={t("orderDetail.cancellation")}
            detail={t("orderDetail.terminalState")}
          />
          <InfoRow label={t("orderDetail.cancelled")} value={cancellation.cancelledAt} />
          {cancellation.reason ? (
            <InfoRow label={t("orderDetail.reason")} value={cancellation.reason} />
          ) : null}
        </Surface>
      ) : null}

      <SectionHeading
        title={t("orderDetail.linesCount", { count: lines.length })}
        detail={t("orderDetail.immutableSnapshot")}
      />
      {lines.length === 0 ? (
        <EmptyState
          icon="format-list-bulleted"
          title={t("orderDetail.noLinesTitle")}
          message={t("orderDetail.noLinesMsg")}
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
                  label={t("orderDetail.unitPrice")}
                  value={formatMoneyMinor(line.unitPriceMinor, header.currency)}
                />
                <InfoRow
                  label={t("orderDetail.lineTotal")}
                  value={formatMoneyMinor(line.lineTotalMinor, header.currency)}
                />
                {fulfillment ? (
                  <InfoRow
                    label={t("orderDetail.fulfilled")}
                    value={fulfillmentQuantityLabel(
                      fulfillment.fulfilledQuantity,
                      fulfillment.orderedQuantity,
                    )}
                  />
                ) : null}
                {returned > 0 ? (
                  <InfoRow label={t("orderDetail.returned")} value={String(returned)} />
                ) : null}
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
            <Text style={detailStyles.cardTitle}>{t("orderDetail.fulfillment")}</Text>
            <Body>{t("orderDetail.fulfillmentProgress")}</Body>
          </View>
        </View>
        <Badge
          label={fulfillmentStatusLabel(fulfillmentProgress.status)}
          testID="order-fulfillment-status"
        />
      </Surface>

      {hasReturnActivity(data.returns) && data.returns ? (
        <Surface>
          <SectionHeading
            title={t("orderDetail.returnsRefunds")}
            detail={t("orderDetail.readOnly")}
          />
          <InfoRow
            label={t("orderDetail.pendingRefunds")}
            value={formatMoneyMinor(data.returns.pendingRefundMinor, header.currency)}
          />
          <InfoRow
            label={t("orderDetail.refunded")}
            value={formatMoneyMinor(data.returns.refundedMinor, header.currency)}
          />
        </Surface>
      ) : null}

      {onCreateReturn ? (
        <Surface tone="accent">
          <SectionHeading
            title={t("orderDetail.startReturn")}
            detail={t("orderDetail.startReturnDetail")}
          />
          <PrimaryButton
            label={t("orderDetail.newReturn")}
            icon="keyboard-return"
            testID="order-new-return"
            onPress={() => onCreateReturn(header.id)}
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
