import type { ReturnDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  Checkbox,
  Divider,
  Eyebrow,
  FormSection,
  InfoRow,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  TextButton,
  TextField,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import { canSettleRefund, submitSettleRefund } from "./create";
import {
  dispositionLabel,
  refundMethodLabel,
  refundStatusDetail,
  refundStatusLabel,
  returnChannelLabel,
  returnSourceLabel,
} from "./refund";
import { describeReturnWriteError } from "./write-errors";

/** Max settlement-reference length the API accepts (mirrors the POS desk's cap). */
const MAX_SETTLEMENT_REFERENCE = 200;

export interface ReturnDetailScreenProps {
  tenantId: string;
  returnId: string;
  onBack: () => void;
  /** When provided, offers navigation back to the return's original order. */
  onOpenOrder?: (orderId: string) => void;
  /** Test seam for the settle-refund idempotency key. */
  generateIdempotencyKey?: IdempotencyKeyFactory;
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
  generateIdempotencyKey,
}: ReturnDetailScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const load = useCallback(() => client.getReturn(returnId), [client, returnId]);
  const { state, reload } = useAsync<ReturnDetailResponse>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("returnDetail.eyebrow")}
          title={t("returnDetail.title")}
          onBack={onBack}
        />
        <Divider />
        <LoadingBlock label={t("returnDetail.loading")} />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("returnDetail.eyebrow")}
          title={errorHeading(state.error.kind)}
          onBack={onBack}
        />
        <Divider />
        <Body>{state.error.message}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label={t("common.tryAgain")} onPress={reload} />
        ) : null}
      </ScrollScreen>
    );
  }

  return (
    <ReturnDetail
      data={state.data}
      client={client}
      onBack={onBack}
      onOpenOrder={onOpenOrder}
      onSettled={reload}
      generateKey={generateIdempotencyKey ?? secureIdempotencyKey}
    />
  );
}

function ReturnDetail({
  data,
  client,
  onBack,
  onOpenOrder,
  onSettled,
  generateKey,
}: {
  data: ReturnDetailResponse;
  client: Pick<TenantCommerceClient, "settleRefund">;
  onBack: () => void;
  onOpenOrder?: (orderId: string) => void;
  onSettled: () => void;
  generateKey: IdempotencyKeyFactory;
}) {
  const { refund } = data;
  const { t } = useI18n();

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("returnDetail.eyebrow")}
        title={t("returnDetail.title")}
        onBack={onBack}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Badge label={data.status} testID="return-detail-status" />
        <Badge label={returnChannelLabel(data.channel)} testID="return-detail-channel" />
      </View>
      <Divider />
      <InfoRow label={t("returnDetail.originalOrder")} value={data.orderId} />
      {onOpenOrder ? (
        <TextButton label={t("returnDetail.viewOrder")} onPress={() => onOpenOrder(data.orderId)} />
      ) : null}
      <InfoRow
        label={t("returnDetail.returnedValue")}
        value={formatMoneyMinor(data.amountMinor, data.currency)}
      />
      <InfoRow label={t("returnDetail.accepted")} value={data.createdAt} />
      <InfoRow label={t("returnDetail.source")} value={returnSourceLabel(data.source)} />
      <InfoRow label={t("returnDetail.actor")} value={data.actorMembershipId} />
      <Body>{t("returnDetail.sourceNote")}</Body>
      <InfoRow label={t("returnDetail.returnId")} value={data.id} />

      <Divider />
      <Eyebrow>{t("returnDetail.refund")}</Eyebrow>
      {/* Refund state is rendered exactly as the server reports it; pending is never shown as settled. */}
      <View style={{ flexDirection: "row" }}>
        <Badge label={refundStatusLabel(refund.status)} testID="return-refund-status" />
      </View>
      <Body>{refundStatusDetail(refund.status)}</Body>
      <InfoRow label={t("returnDetail.method")} value={refundMethodLabel(refund.method)} />
      <InfoRow
        label={t("returnDetail.amount")}
        value={formatMoneyMinor(refund.amountMinor, refund.currency)}
      />
      {refund.settlementReference ? (
        <InfoRow label={t("returnDetail.settlementRef")} value={refund.settlementReference} />
      ) : null}
      {refund.settledAt ? (
        <InfoRow label={t("returnDetail.settled")} value={refund.settledAt} />
      ) : null}

      {canSettleRefund(refund) ? (
        <SettleRefundPanel
          client={client}
          returnId={data.id}
          onSettled={onSettled}
          generateKey={generateKey}
        />
      ) : null}

      <Divider />
      <Eyebrow>{t("returnDetail.inventoryDisposition")}</Eyebrow>
      {/* The operational effect on stock: restock lines re-enter a canonical inventory receipt. */}
      {data.inventoryOperationId ? (
        <View>
          <Body>{t("returnDetail.restockedNote")}</Body>
          {data.inventoryLocationId ? (
            <InfoRow label={t("returnDetail.receivingLocation")} value={data.inventoryLocationId} />
          ) : null}
          <InfoRow label={t("returnDetail.inventoryOperation")} value={data.inventoryOperationId} />
        </View>
      ) : (
        <Body>{t("returnDetail.noReceipt")}</Body>
      )}

      <Divider />
      <Eyebrow>{t("returnDetail.linesCount", { count: data.lines.length })}</Eyebrow>
      <View style={{ gap: 12 }}>
        {data.lines.map((line) => (
          <View key={line.lineNumber} testID={`return-line-${line.lineNumber}`} style={{ gap: 4 }}>
            <Title>{t("returnDetail.lineN", { n: line.lineNumber })}</Title>
            <InfoRow label={t("returnDetail.qtyReturned")} value={String(line.quantity)} />
            <InfoRow label={t("returnDetail.reason")} value={line.reason} />
            <InfoRow
              label={t("returnDetail.disposition")}
              value={dispositionLabel(line.disposition)}
            />
            <InfoRow
              label={t("returnDetail.lineRefund")}
              value={formatMoneyMinor(line.amountMinor, data.currency)}
            />
            <InfoRow label={t("returnDetail.variant")} value={line.variantId} />
          </View>
        ))}
      </View>
    </ScrollScreen>
  );
}

/**
 * Records that a pending manual refund has been paid out. Settlement is a deliberate, attested action:
 * the operator confirms the money was handed back and supplies a settlement reference. The API enforces
 * the tenant's manual-refund policy and limits; a rejection (e.g. settlement no longer allowed) surfaces
 * with its own recovery affordance. On success the detail is re-read so the refund renders as settled.
 */
function SettleRefundPanel({
  client,
  returnId,
  onSettled,
  generateKey,
}: {
  client: Pick<TenantCommerceClient, "settleRefund">;
  returnId: string;
  onSettled: () => void;
  generateKey: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation(
    (args: { returnId: string; settlementReference: string }, key) =>
      submitSettleRefund(client, args, key),
    generateKey,
    { onSuccess: onSettled },
  );

  function onSubmit() {
    const trimmed = reference.trim();
    if (!confirmed) {
      setLocalError(t("settleRefund.errConfirm"));
      return;
    }
    if (trimmed.length === 0) {
      setLocalError(t("settleRefund.errReference"));
      return;
    }
    setLocalError(null);
    mutation.submit({ returnId, settlementReference: trimmed });
  }

  const described =
    mutation.state.status === "error" ? describeReturnWriteError(mutation.state.error) : null;

  return (
    <FormSection
      title={t("settleRefund.title")}
      description={t("settleRefund.desc")}
      icon="cash-refund"
    >
      <TextField
        label={t("settleRefund.referenceLabel")}
        value={reference}
        onChangeText={(value) => {
          setReference(value.slice(0, MAX_SETTLEMENT_REFERENCE));
          if (localError) setLocalError(null);
        }}
        placeholder={t("settleRefund.referencePlaceholder")}
        testID="settle-refund-reference"
        required
      />
      <Checkbox
        testID="settle-refund-confirm"
        checked={confirmed}
        label={t("settleRefund.attest")}
        onChange={(next) => {
          setConfirmed(next);
          if (localError) setLocalError(null);
        }}
      />
      {localError ? <Body>{localError}</Body> : null}
      {described ? (
        <Notice
          tone="danger"
          title={described.heading}
          message={described.message}
          testID="settle-refund-error"
          action={
            described.recovery === "retry" ? (
              <TextButton
                label={t("common.retry")}
                icon="refresh"
                testID="settle-refund-retry"
                onPress={() => mutation.retry()}
              />
            ) : (
              <TextButton
                label={t("common.dismiss")}
                icon="close"
                onPress={() => mutation.reset()}
              />
            )
          }
        />
      ) : null}
      <PrimaryButton
        label={
          mutation.state.status === "submitting"
            ? t("settleRefund.recording")
            : t("settleRefund.recordCta")
        }
        icon="check"
        testID="settle-refund-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </FormSection>
  );
}
