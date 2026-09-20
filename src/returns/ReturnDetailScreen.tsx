import type { ReturnDetailResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback } from "react";
import { View } from "react-native";

import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
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
import {
  dispositionLabel,
  refundMethodLabel,
  refundStatusDetail,
  refundStatusLabel,
  returnChannelLabel,
  returnSourceLabel,
} from "./refund";

export interface ReturnDetailScreenProps {
  tenantId: string;
  returnId: string;
  onBack: () => void;
  /** When provided, offers navigation back to the return's original order. */
  onOpenOrder?: (orderId: string) => void;
}

/**
 * Read-only detail for a single accepted return. Renders only the server's own fields from
 * `GET /returns/{id}` — original order, lines, quantities, reason, disposition, refund amount/state,
 * actor/source and timestamps. It exposes no create-return, refund-settlement or other mutation: this
 * is management visibility, not a cashier return terminal.
 */
export function ReturnDetailScreen({
  tenantId,
  returnId,
  onBack,
  onOpenOrder,
}: ReturnDetailScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const load = useCallback(() => client.getReturn(returnId), [client, returnId]);
  const { state, reload } = useAsync<ReturnDetailResponse>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Returns" title="Return" onBack={onBack} />
        <Divider />
        <LoadingBlock label="Loading return…" />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Returns" title={errorHeading(state.error.kind)} onBack={onBack} />
        <Divider />
        <Body>{state.error.message}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label="Try again" onPress={reload} />
        ) : null}
      </ScrollScreen>
    );
  }

  return <ReturnDetail data={state.data} onBack={onBack} onOpenOrder={onOpenOrder} />;
}

function ReturnDetail({
  data,
  onBack,
  onOpenOrder,
}: {
  data: ReturnDetailResponse;
  onBack: () => void;
  onOpenOrder?: (orderId: string) => void;
}) {
  const { refund } = data;

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Returns" title="Return" onBack={onBack} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Badge label={data.status} testID="return-detail-status" />
        <Badge label={returnChannelLabel(data.channel)} testID="return-detail-channel" />
      </View>
      <Divider />
      <InfoRow label="Original order" value={data.orderId} />
      {onOpenOrder ? (
        <TextButton label="View original order" onPress={() => onOpenOrder(data.orderId)} />
      ) : null}
      <InfoRow label="Returned value" value={formatMoneyMinor(data.amountMinor, data.currency)} />
      <InfoRow label="Accepted" value={data.createdAt} />
      <InfoRow label="Source" value={returnSourceLabel(data.source)} />
      <InfoRow label="Actor" value={data.actorMembershipId} />
      <Body>
        Source is audit metadata recorded at acceptance — it is not an authorization credential.
      </Body>
      <InfoRow label="Return id" value={data.id} />

      <Divider />
      <Eyebrow>Refund</Eyebrow>
      {/* Refund state is rendered exactly as the server reports it; pending is never shown as settled. */}
      <View style={{ flexDirection: "row" }}>
        <Badge label={refundStatusLabel(refund.status)} testID="return-refund-status" />
      </View>
      <Body>{refundStatusDetail(refund.status)}</Body>
      <InfoRow label="Method" value={refundMethodLabel(refund.method)} />
      <InfoRow label="Amount" value={formatMoneyMinor(refund.amountMinor, refund.currency)} />
      {refund.settlementReference ? (
        <InfoRow label="Settlement reference" value={refund.settlementReference} />
      ) : null}
      {refund.settledAt ? <InfoRow label="Settled" value={refund.settledAt} /> : null}

      <Divider />
      <Eyebrow>Inventory disposition</Eyebrow>
      {/* The operational effect on stock: restock lines re-enter a canonical inventory receipt. */}
      {data.inventoryOperationId ? (
        <View>
          <Body>Restocked units re-entered sellable inventory as a stock receipt.</Body>
          {data.inventoryLocationId ? (
            <InfoRow label="Receiving location" value={data.inventoryLocationId} />
          ) : null}
          <InfoRow label="Inventory operation" value={data.inventoryOperationId} />
        </View>
      ) : (
        <Body>No stock receipt — returned units did not re-enter sellable inventory.</Body>
      )}

      <Divider />
      <Eyebrow>Lines ({data.lines.length})</Eyebrow>
      <View style={{ gap: 12 }}>
        {data.lines.map((line) => (
          <View key={line.lineNumber} testID={`return-line-${line.lineNumber}`} style={{ gap: 4 }}>
            <Title>Line {line.lineNumber}</Title>
            <InfoRow label="Quantity returned" value={String(line.quantity)} />
            <InfoRow label="Reason" value={line.reason} />
            <InfoRow label="Disposition" value={dispositionLabel(line.disposition)} />
            <InfoRow
              label="Line refund"
              value={formatMoneyMinor(line.amountMinor, data.currency)}
            />
            <InfoRow label="Variant" value={line.variantId} />
          </View>
        ))}
      </View>
    </ScrollScreen>
  );
}
