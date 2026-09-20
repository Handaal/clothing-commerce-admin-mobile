import type { OrderDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo } from "react";
import { View } from "react-native";

import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { ReturnHistory } from "../returns/ReturnHistory";
import { hasReturnActivity, returnedQuantityByLine } from "../returns/summary";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  TextButton,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
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
  /** When provided, return-history rows navigate to the full return detail. */
  onOpenReturn?: (returnId: string) => void;
}

/**
 * Read-only detail for a single order. Renders only fields returned by `GET /orders/{id}`. The fetch
 * is keyed on `[client, orderId]`, so navigating from order A to order B re-runs the load and the
 * shared `useAsync` guards against a slow A-response settling over B's state.
 */
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
        <PageHeader eyebrow="Orders" title="Order" onBack={onBack} />
        <Divider />
        <LoadingBlock label="Loading order…" />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Orders" title={errorHeading(state.error.kind)} onBack={onBack} />
        <Divider />
        <Body>{state.error.message}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label="Try again" onPress={reload} />
        ) : null}
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
      <PageHeader eyebrow="Orders" title={header.orderNumber} onBack={onBack} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Badge label={header.status} testID="order-detail-status" />
      </View>
      <Divider />
      <InfoRow label="Channel" value={header.channel.toUpperCase()} />
      <InfoRow label="Total" value={formatMoneyMinor(header.totalMinor, header.currency)} />
      <InfoRow label="Placed" value={header.placedAt} />
      <InfoRow label="Order id" value={header.id} />
      <TextButton label="Refresh order" onPress={onRefresh} />
      <Body>Last loaded order state. Refresh to check for updates.</Body>

      {header.channel === "online" || data.commerce ? <OrderCommerce data={data} /> : null}

      {cancellation ? (
        <>
          <Divider />
          <Eyebrow>Cancellation</Eyebrow>
          <InfoRow label="Cancelled" value={cancellation.cancelledAt} />
          {cancellation.reason ? <InfoRow label="Reason" value={cancellation.reason} /> : null}
        </>
      ) : null}

      <Divider />
      <Eyebrow>Lines ({lines.length})</Eyebrow>
      {lines.length === 0 ? (
        <Body>This order has no lines.</Body>
      ) : (
        <View style={{ gap: 12 }}>
          {lines.map((line) => {
            const fulfillment = fulfillmentByLine.get(line.lineNumber);
            return (
              <View
                key={line.lineNumber}
                testID={`order-line-${line.lineNumber}`}
                style={{ gap: 4 }}
              >
                <Title>{line.productName}</Title>
                <InfoRow label="SKU" value={line.sku} />
                <InfoRow label="Quantity" value={String(line.quantity)} />
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
                {(returnedByLine.get(line.lineNumber) ?? 0) > 0 ? (
                  <InfoRow label="Returned" value={String(returnedByLine.get(line.lineNumber))} />
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Divider />
      <Eyebrow>Fulfillment</Eyebrow>
      {/* Overall status is shown exactly as the server reports it — never inferred client-side. */}
      <View style={{ flexDirection: "row" }}>
        <Badge
          label={fulfillmentStatusLabel(fulfillmentProgress.status)}
          testID="order-fulfillment-status"
        />
      </View>

      {/* Returns summary from the order projection (present only with return scope). The exact
          pending/refunded split is shown; a pending obligation is never rendered as refunded. */}
      {hasReturnActivity(data.returns) && data.returns ? (
        <>
          <Divider />
          <Eyebrow>Returns &amp; refunds</Eyebrow>
          <InfoRow
            label="Pending refunds"
            value={formatMoneyMinor(data.returns.pendingRefundMinor, header.currency)}
          />
          <InfoRow
            label="Refunded"
            value={formatMoneyMinor(data.returns.refundedMinor, header.currency)}
          />
        </>
      ) : null}

      <ReturnHistory client={client} orderId={header.id} onOpenReturn={onOpenReturn} />
    </ScrollScreen>
  );
}
