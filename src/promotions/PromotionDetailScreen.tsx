import type { MeContextResponse, PromotionDetail } from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect } from "react";

import { t as translate, useI18n } from "../i18n";
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
import { useToast } from "../ui/Toast";
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
  const { t } = useI18n();
  if (!canRead) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("promotions.eyebrow")}
          title={t("promoDetail.singular")}
          description={t("promoDetail.accessDesc")}
          icon="ticket-percent-outline"
          onBack={onBack}
        />
        <Notice tone="warning" message={t("promotions.accessBody")} />
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
  const { t } = useI18n();
  const load = useCallback(() => client.getPromotion(promotionId), [client, promotionId]);
  const { state, reload } = useAsync<PromotionDetail>(load);
  const statusProducer = useCallback(
    (status: PromotionDetail["status"], idempotencyKey: string) =>
      client.setPromotionStatus({ promotionId, status, idempotencyKey }),
    [client, promotionId],
  );
  const toast = useToast();
  const statusMutation = useMutation(statusProducer, generateIdempotencyKey, {
    onSuccess: (promotion) =>
      toast.success(
        t("promoDetail.statusToast", {
          name: promotion.name,
          status: t(promotion.status === "active" ? "promoState.active" : "promoState.inactive"),
        }),
        { title: t("promoDetail.updatedToast") },
      ),
    onError: (error) => {
      const described = describePromotionWriteError(error);
      toast.error(described.message, {
        title: described.heading,
        ...(described.recovery === "retry"
          ? { action: { label: t("common.retry"), icon: "refresh" as const, onPress: () => statusMutation.retry() } }
          : {}),
      });
    },
  });

  useEffect(() => {
    if (statusMutation.state.status === "success") reload();
  }, [reload, statusMutation.state.status]);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("promotions.eyebrow")}
          title={t("promoDetail.singular")}
          icon="ticket-percent-outline"
          onBack={onBack}
        />
        <LoadingBlock label={t("promoDetail.loading")} />
      </ScrollScreen>
    );
  }
  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("promotions.eyebrow")}
          title={errorHeading(state.error.kind)}
          icon="ticket-percent-outline"
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

  const promotion = state.data;
  const statusError =
    statusMutation.state.status === "error"
      ? describePromotionWriteError(statusMutation.state.error)
      : undefined;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("promoDetail.recordEyebrow")}
        title={promotion.name}
        description={t("promoDetail.recordDesc")}
        icon="ticket-percent-outline"
        onBack={onBack}
      />
      <Surface tone="brand">
        <Badge
          label={effectiveStateLabel(promotionEffectiveState(promotion))}
          testID="promotion-detail-status"
        />
        <InfoRow label={t("promoForm.activation")} value={activationLabel(promotion.activationType)} />
      </Surface>
      {promotion.economicsLocked ? (
        <Notice
          testID="promotion-detail-economics-locked"
          tone="warning"
          title={t("promoDetail.economicsLockedTitle")}
          message={t("promoDetail.economicsLockedMsg")}
        />
      ) : null}
      {canManage ? (
        <Surface>
          <PrimaryButton
            label={t("promoDetail.editCta")}
            icon="pencil-outline"
            testID="promotion-edit"
            onPress={() => onEdit(promotion.id)}
          />
          {promotion.status === "active" ? (
            <ConfirmButton
              label={t("promoDetail.deactivate")}
              confirmLabel={t("promoDetail.confirmDeactivate")}
              testID="promotion-status-toggle"
              disabled={statusMutation.state.status === "submitting"}
              onConfirm={() => statusMutation.submit("inactive")}
            />
          ) : (
            <PrimaryButton
              label={t("promoDetail.activate")}
              icon="play-circle-outline"
              testID="promotion-status-toggle"
              disabled={statusMutation.state.status === "submitting"}
              onPress={() => statusMutation.submit("active")}
            />
          )}
        </Surface>
      ) : (
        <Notice testID="promotion-detail-read-only" message={t("promotions.readOnly")} />
      )}
      {statusError ? (
        <Notice
          tone="danger"
          title={statusError.heading}
          message={statusError.message}
          action={
            statusError.recovery === "retry" ? (
              <PrimaryButton label={t("common.retrySafely")} icon="refresh" onPress={statusMutation.retry} />
            ) : undefined
          }
        />
      ) : null}

      <DetailSection title={t("promoForm.sectionBasics")} icon="information-outline">
        {promotion.description ? <Body>{promotion.description}</Body> : null}
        <InfoRow
          label={t("promoDetail.persistedLifecycle")}
          value={t(promotion.status === "active" ? "promoState.active" : "promoState.inactive")}
        />
        <InfoRow label={t("promoForm.activation")} value={activationLabel(promotion.activationType)} />
        <InfoRow label={t("promoForm.channel")} value={channelLabel(promotion.channel)} />
      </DetailSection>
      <DetailSection title={t("promoForm.sectionBenefit")} icon="sale-outline">
        <InfoRow label={t("promoDetail.discount")} value={benefitLabel(promotion)} />
        <InfoRow
          label={t("promoDetail.minSubtotal")}
          value={formatPromotionMoney(promotion.minSubtotalMinor, promotion.benefitCurrency)}
        />
        <InfoRow
          label={t("promoDetail.maxDiscount")}
          value={formatPromotionMoney(promotion.maxDiscountMinor, promotion.benefitCurrency)}
        />
      </DetailSection>
      <DetailSection title={t("promoForm.sectionEligibility")} icon="target">
        <InfoRow label={t("promoForm.target")} value={targetTypeLabel(promotion.targetType)} />
        <InfoRow label={t("promoDetail.brand")} value={restrictionName(context, "brand", promotion.brandId)} />
        <InfoRow label={t("promoDetail.branch")} value={restrictionName(context, "branch", promotion.branchId)} />
        {promotion.targetType === "variant_scope" ? (
          promotion.targets.length > 0 ? (
            promotion.targets.map((target, index) => (
              <SurfaceRow key={`${target.productId ?? target.variantId}-${index}`}>
                <InfoRow
                  label={t("promoDetail.targetN", { n: index + 1 })}
                  value={target.productId ? t("promoDetail.selectedProduct") : t("promoDetail.selectedVariant")}
                />
              </SurfaceRow>
            ))
          ) : (
            <Body>{t("promoDetail.noTargets")}</Body>
          )
        ) : null}
      </DetailSection>
      <DetailSection title={t("promoForm.sectionUsage")} icon="counter">
        <InfoRow
          label={t("promoDetail.globalUsage")}
          value={usageLabel(promotion.redemptionCount, promotion.globalRedemptionLimit)}
        />
        <InfoRow
          label={t("promoDetail.remaining")}
          value={
            promotion.remainingRedemptions === null
              ? t("promoForm.unlimited")
              : String(promotion.remainingRedemptions)
          }
        />
      </DetailSection>
      <DetailSection title={t("promoForm.sectionSchedule")} icon="calendar-clock-outline">
        <InfoRow label={t("promoDetail.starts")} value={formatPromotionDate(promotion.startsAt)} />
        <InfoRow label={t("promoDetail.ends")} value={formatPromotionDate(promotion.endsAt)} />
      </DetailSection>
      <DetailSection title={t("promoDetail.codesSection")} icon="ticket-confirmation-outline">
        {promotion.activationType === "code" ? (
          <PromotionCodes
            client={client}
            promotion={promotion}
            canManage={canManage}
            onChanged={reload}
            generateIdempotencyKey={generateIdempotencyKey}
          />
        ) : (
          <Body>{t("promoDetail.automaticNoCode")}</Body>
        )}
      </DetailSection>
    </ScrollScreen>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: AppIconName;
  children: React.ReactNode;
}) {
  return (
    <FormSection title={title} icon={icon}>
      {children}
    </FormSection>
  );
}

function restrictionName(
  context: MeContextResponse,
  kind: "brand" | "branch",
  id: string | null,
): string {
  if (id === null) return kind === "brand" ? translate("promoForm.allBrands") : translate("promoForm.allBranches");
  if (kind === "branch") {
    return (
      context.access.orders.branches.find((item) => item.id === id)?.name ??
      translate("promoDetail.restrictedBranch")
    );
  }
  const brands = [...context.access.catalog.brands, ...context.access.orders.brands];
  return brands.find((item) => item.id === id)?.name ?? translate("promoDetail.restrictedBrand");
}
