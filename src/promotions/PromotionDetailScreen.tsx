import type { MeContextResponse, PromotionDetail } from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect } from "react";
import { View } from "react-native";

import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  ConfirmButton,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SurfaceRow,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import type { PromotionClient } from "./client";
import {
  activationLabel,
  benefitLabel,
  channelLabel,
  effectiveStateLabel,
  formatPromotionDate,
  formatPromotionMoney,
  promotionEffectiveState,
  targetTypeLabel,
  usageLabel,
} from "./display";
import { PromotionCodes } from "./PromotionCodes";
import { describePromotionWriteError } from "./write-errors";

export function PromotionDetailScreen({
  client,
  context,
  promotionId,
  canRead,
  canManage,
  onEdit,
  onBack,
  generateIdempotencyKey = secureIdempotencyKey,
}: {
  client: PromotionClient;
  context: MeContextResponse;
  promotionId: string;
  canRead: boolean;
  canManage: boolean;
  onEdit: (promotionId: string) => void;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}) {
  if (!canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Promotions" title="Promotion" onBack={onBack} />
        <Body>You do not have Promotion read access.</Body>
      </ScrollScreen>
    );
  }
  return (
    <PromotionDetailContent
      client={client}
      context={context}
      promotionId={promotionId}
      canManage={canManage}
      onEdit={onEdit}
      onBack={onBack}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}

function PromotionDetailContent({
  client,
  context,
  promotionId,
  canManage,
  onEdit,
  onBack,
  generateIdempotencyKey,
}: {
  client: PromotionClient;
  context: MeContextResponse;
  promotionId: string;
  canManage: boolean;
  onEdit: (promotionId: string) => void;
  onBack: () => void;
  generateIdempotencyKey: IdempotencyKeyFactory;
}) {
  const load = useCallback(() => client.getPromotion(promotionId), [client, promotionId]);
  const { state, reload } = useAsync<PromotionDetail>(load);
  const statusProducer = useCallback(
    (status: PromotionDetail["status"], idempotencyKey: string) =>
      client.setPromotionStatus({ promotionId, status, idempotencyKey }),
    [client, promotionId],
  );
  const statusMutation = useMutation(statusProducer, generateIdempotencyKey);

  useEffect(() => {
    if (statusMutation.state.status === "success") reload();
  }, [reload, statusMutation.state.status]);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Promotions" title="Promotion" onBack={onBack} />
        <LoadingBlock label="Loading Promotion…" />
      </ScrollScreen>
    );
  }
  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Promotions" title={errorHeading(state.error.kind)} onBack={onBack} />
        <Body>{state.error.message}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label="Try again" onPress={reload} />
        ) : null}
      </ScrollScreen>
    );
  }

  const promotion = state.data;
  const statusError =
    statusMutation.state.status === "error"
      ? describePromotionWriteError(statusMutation.state.error)
      : undefined;

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Promotions" title={promotion.name} onBack={onBack} />
      <Badge
        label={effectiveStateLabel(promotionEffectiveState(promotion))}
        testID="promotion-detail-status"
      />
      {promotion.economicsLocked ? (
        <Body testID="promotion-detail-economics-locked">
          Used Promotion · discount economics are locked. Deactivate and create a new Promotion to
          change them.
        </Body>
      ) : null}
      {canManage ? (
        <>
          <PrimaryButton
            label="Edit Promotion"
            testID="promotion-edit"
            onPress={() => onEdit(promotion.id)}
          />
          {promotion.status === "active" ? (
            <ConfirmButton
              label="Deactivate Promotion"
              confirmLabel="Confirm deactivation"
              testID="promotion-status-toggle"
              disabled={statusMutation.state.status === "submitting"}
              onConfirm={() => statusMutation.submit("inactive")}
            />
          ) : (
            <PrimaryButton
              label="Activate Promotion"
              testID="promotion-status-toggle"
              disabled={statusMutation.state.status === "submitting"}
              onPress={() => statusMutation.submit("active")}
            />
          )}
        </>
      ) : (
        <Body testID="promotion-detail-read-only">
          Read-only access · management actions are hidden.
        </Body>
      )}
      {statusError ? (
        <View style={{ gap: 8 }}>
          <Title>{statusError.heading}</Title>
          <Body>{statusError.message}</Body>
          {statusError.recovery === "retry" ? (
            <PrimaryButton label="Retry safely" onPress={statusMutation.retry} />
          ) : null}
        </View>
      ) : null}

      <DetailSection title="Basics">
        {promotion.description ? <Body>{promotion.description}</Body> : null}
        <InfoRow label="Persisted lifecycle" value={promotion.status} />
        <InfoRow label="Activation" value={activationLabel(promotion.activationType)} />
        <InfoRow label="Channel" value={channelLabel(promotion.channel)} />
      </DetailSection>
      <DetailSection title="Benefit">
        <InfoRow label="Discount" value={benefitLabel(promotion)} />
        <InfoRow
          label="Minimum subtotal"
          value={formatPromotionMoney(promotion.minSubtotalMinor, promotion.benefitCurrency)}
        />
        <InfoRow
          label="Maximum discount"
          value={formatPromotionMoney(promotion.maxDiscountMinor, promotion.benefitCurrency)}
        />
      </DetailSection>
      <DetailSection title="Eligibility">
        <InfoRow label="Target" value={targetTypeLabel(promotion.targetType)} />
        <InfoRow label="Brand" value={restrictionName(context, "brand", promotion.brandId)} />
        <InfoRow label="Branch" value={restrictionName(context, "branch", promotion.branchId)} />
        {promotion.targetType === "variant_scope" ? (
          promotion.targets.length > 0 ? (
            promotion.targets.map((target, index) => (
              <SurfaceRow key={`${target.productId ?? target.variantId}-${index}`}>
                <InfoRow
                  label={`Target ${index + 1}`}
                  value={target.productId ? "Selected Product" : "Selected Variant"}
                />
              </SurfaceRow>
            ))
          ) : (
            <Body>No target records returned.</Body>
          )
        ) : null}
      </DetailSection>
      <DetailSection title="Usage">
        <InfoRow
          label="Global usage"
          value={usageLabel(promotion.redemptionCount, promotion.globalRedemptionLimit)}
        />
        <InfoRow
          label="Remaining"
          value={
            promotion.remainingRedemptions === null
              ? "Unlimited"
              : String(promotion.remainingRedemptions)
          }
        />
      </DetailSection>
      <DetailSection title="Schedule">
        <InfoRow label="Starts" value={formatPromotionDate(promotion.startsAt)} />
        <InfoRow label="Ends" value={formatPromotionDate(promotion.endsAt)} />
      </DetailSection>
      <DetailSection title="Promotion Codes">
        {promotion.activationType === "code" ? (
          <PromotionCodes
            client={client}
            promotion={promotion}
            canManage={canManage}
            onChanged={reload}
            generateIdempotencyKey={generateIdempotencyKey}
          />
        ) : (
          <Body>Automatic Promotion · no code is required.</Body>
        )}
      </DetailSection>
    </ScrollScreen>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Divider />
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

function restrictionName(
  context: MeContextResponse,
  kind: "brand" | "branch",
  id: string | null,
): string {
  if (id === null) return kind === "brand" ? "All brands" : "All branches";
  if (kind === "branch") {
    return (
      context.access.orders.branches.find((item) => item.id === id)?.name ?? "Restricted branch"
    );
  }
  const brands = [...context.access.catalog.brands, ...context.access.orders.brands];
  return brands.find((item) => item.id === id)?.name ?? "Restricted brand";
}
