import type { MeContextResponse, PromotionDetail } from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect } from "react";

import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  ConfirmButton,
  FormSection,
  InfoRow,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  Surface,
  SurfaceRow,
} from "../ui/components";
import type { AppIconName } from "../ui/Icon";
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
        <PageHeader
          eyebrow="Growth"
          title="Promotion"
          description="Review promotion economics, eligibility and redemption controls."
          icon="ticket-percent-outline"
          onBack={onBack}
        />
        <Notice tone="warning" message="You do not have Promotion read access." />
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
        <PageHeader
          eyebrow="Growth"
          title="Promotion"
          icon="ticket-percent-outline"
          onBack={onBack}
        />
        <LoadingBlock label="Loading Promotion…" />
      </ScrollScreen>
    );
  }
  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow="Growth"
          title={errorHeading(state.error.kind)}
          icon="ticket-percent-outline"
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

  const promotion = state.data;
  const statusError =
    statusMutation.state.status === "error"
      ? describePromotionWriteError(statusMutation.state.error)
      : undefined;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow="Promotion record"
        title={promotion.name}
        description="Manage lifecycle, restrictions, schedule and voucher codes."
        icon="ticket-percent-outline"
        onBack={onBack}
      />
      <Surface tone="brand">
        <Badge
          label={effectiveStateLabel(promotionEffectiveState(promotion))}
          testID="promotion-detail-status"
        />
        <InfoRow label="Activation" value={activationLabel(promotion.activationType)} />
      </Surface>
      {promotion.economicsLocked ? (
        <Notice
          testID="promotion-detail-economics-locked"
          tone="warning"
          title="Discount locked after redemption"
          message="Used Promotion · discount economics are locked. Deactivate and create a new Promotion to change them."
        />
      ) : null}
      {canManage ? (
        <Surface>
          <PrimaryButton
            label="Edit Promotion"
            icon="pencil-outline"
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
              icon="play-circle-outline"
              testID="promotion-status-toggle"
              disabled={statusMutation.state.status === "submitting"}
              onPress={() => statusMutation.submit("active")}
            />
          )}
        </Surface>
      ) : (
        <Notice
          testID="promotion-detail-read-only"
          message="Read-only access · management actions are hidden."
        />
      )}
      {statusError ? (
        <Notice
          tone="danger"
          title={statusError.heading}
          message={statusError.message}
          action={
            statusError.recovery === "retry" ? (
              <PrimaryButton label="Retry safely" icon="refresh" onPress={statusMutation.retry} />
            ) : undefined
          }
        />
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
    <FormSection title={title} icon={detailSectionIcon(title)}>
      {children}
    </FormSection>
  );
}

function detailSectionIcon(title: string): AppIconName {
  switch (title) {
    case "Basics":
      return "information-outline";
    case "Benefit":
      return "sale-outline";
    case "Eligibility":
      return "target";
    case "Usage":
      return "counter";
    case "Schedule":
      return "calendar-clock-outline";
    default:
      return "ticket-confirmation-outline";
  }
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
