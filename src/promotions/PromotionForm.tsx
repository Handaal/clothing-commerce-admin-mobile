import type {
  CreatePromotionRequest,
  MeContextResponse,
  PromotionDetail,
  UpdatePromotionRequest,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";

import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  Body,
  EmptyState,
  FieldError as ThemedFieldError,
  FormSection,
  InfoRow,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  TextField,
  type SelectOption,
} from "../ui/components";
import { t, useI18n } from "../i18n";
import type { AppIconName } from "../ui/Icon";
import { useToast } from "../ui/Toast";
import { useMutation } from "../ui/useMutation";
import type { PromotionClient } from "./client";
import { activationLabel, benefitLabel, channelLabel, targetTypeLabel } from "./display";
import {
  buildCreatePromotionRequest,
  buildUpdatePromotionRequest,
  EMPTY_PROMOTION_FORM,
  promotionDetailToForm,
  validatePromotionForm,
  type PromotionFormErrors,
  type PromotionFormState,
} from "./form";
import { PromotionTargetSelector } from "./PromotionTargetSelector";
import { describePromotionWriteError } from "./write-errors";

export type PromotionFormMode = "create" | "edit";

type SubmitIntent =
  | { kind: "create"; request: CreatePromotionRequest }
  | { kind: "edit"; promotionId: string; request: UpdatePromotionRequest };

export function PromotionForm({
  mode,
  client,
  context,
  canManage,
  initial,
  onSaved,
  onBack,
  generateIdempotencyKey = secureIdempotencyKey,
}: {
  mode: PromotionFormMode;
  client: PromotionClient;
  context: MeContextResponse;
  canManage: boolean;
  initial?: PromotionDetail;
  onSaved: (promotion: PromotionDetail) => void;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}) {
  const [form, setForm] = useState<PromotionFormState>(() =>
    initial ? promotionDetailToForm(initial) : { ...EMPTY_PROMOTION_FORM },
  );
  const [errors, setErrors] = useState<PromotionFormErrors>({});
  const toast = useToast();
  const { t } = useI18n();
  const producer = useCallback(
    (intent: SubmitIntent, idempotencyKey: string) =>
      intent.kind === "create"
        ? client.createPromotion({ ...intent.request, idempotencyKey })
        : client.updatePromotion({
            promotionId: intent.promotionId,
            ...intent.request,
            idempotencyKey,
          }),
    [client],
  );
  const mutation = useMutation(producer, generateIdempotencyKey, {
    onSuccess: () =>
      toast.success(mode === "create" ? t("promoForm.createdToast") : t("promoForm.savedToast"), {
        title: mode === "create" ? t("promoForm.createdTitle") : t("promoForm.updatedTitle"),
      }),
    onError: (error) => {
      const described = describePromotionWriteError(error);
      toast.error(described.message, {
        title: described.heading,
        ...(described.recovery === "retry"
          ? {
              action: {
                label: t("common.retry"),
                icon: "refresh" as const,
                onPress: () => mutation.retry(),
              },
            }
          : {}),
      });
    },
  });
  const brandOptions = useMemo(() => contextBrandOptions(context), [context]);
  const branchOptions = useMemo(() => contextBranchOptions(context), [context]);

  if (!canManage) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("promotions.title")}
          title={t("promoForm.readOnlyTitle")}
          icon="ticket-percent-outline"
          onBack={onBack}
        />
        <Notice message={t("promoForm.readOnlyMsg")} />
      </ScrollScreen>
    );
  }

  if (mode === "edit" && !initial) {
    throw new Error("Edit Promotion form requires an initial Promotion.");
  }

  if (mutation.state.status === "success") {
    const savedPromotion = mutation.state.data;
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("promotions.title")}
          title={mode === "create" ? t("promoForm.createdTitle") : t("promoForm.updatedTitle")}
          icon="check-circle-outline"
          onBack={onBack}
        />
        <EmptyState
          icon="check-circle-outline"
          title={mode === "create" ? t("promoForm.createdTitle") : t("promoForm.updatedTitle")}
          message={t("promoForm.accepted")}
        />
        <PrimaryButton
          label={t("common.continue")}
          icon="arrow-right"
          testID="promotion-saved-continue"
          onPress={() => onSaved(savedPromotion)}
        />
      </ScrollScreen>
    );
  }

  const describedError =
    mutation.state.status === "error"
      ? describePromotionWriteError(mutation.state.error)
      : undefined;
  const economicsLocked = initial?.economicsLocked ?? false;

  function update<K extends keyof PromotionFormState>(key: K, value: PromotionFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function submit() {
    const nextErrors = validatePromotionForm(form, mode, economicsLocked);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      toast.error(t("common.fixHighlightedSave"));
      return;
    }
    mutation.submit(
      mode === "create"
        ? { kind: "create", request: buildCreatePromotionRequest(form) }
        : {
            kind: "edit",
            promotionId: (initial as PromotionDetail).id,
            request: buildUpdatePromotionRequest(form, initial as PromotionDetail),
          },
    );
  }

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("promotions.title")}
        title={mode === "create" ? t("promoForm.createTitle") : t("promoForm.editTitle")}
        description={t("promoForm.desc")}
        icon={mode === "create" ? "ticket-confirmation-outline" : "pencil-outline"}
        onBack={onBack}
      />

      <Section title={t("promoForm.sectionBasics")} icon="information-outline">
        <TextField
          label={t("promoForm.name")}
          value={form.name}
          onChangeText={(value) => update("name", value)}
          placeholder={t("promoForm.namePlaceholder")}
          testID="promotion-name"
          required
        />
        <FieldError value={errors.name} testID="promotion-name-error" />
        <TextField
          label={t("promoForm.descriptionField")}
          value={form.description}
          onChangeText={(value) => update("description", value)}
          multiline
          testID="promotion-description"
        />
        <FieldError value={errors.description} />
        {mode === "create" ? (
          <>
            <SelectField
              label={t("promoForm.activation")}
              options={[
                { value: "automatic", label: t("promoForm.actAutomatic") },
                { value: "code", label: t("promoForm.actCode") },
              ]}
              selected={form.activationType}
              onSelect={(value) => update("activationType", value as "automatic" | "code")}
              testIDPrefix="promotion-activation"
            />
            <SelectField
              label={t("promoForm.initialLifecycle")}
              options={[
                { value: "inactive", label: t("promoForm.lifeInactive") },
                { value: "active", label: t("promoForm.lifeActive") },
              ]}
              selected={form.status}
              onSelect={(value) => update("status", value as "active" | "inactive")}
              testIDPrefix="promotion-status"
            />
          </>
        ) : (
          <InfoRow label={t("promoForm.activation")} value={activationLabel(form.activationType)} />
        )}
      </Section>

      <Section title={t("promoForm.sectionBenefit")} icon="sale-outline">
        {mode === "create" ? (
          <SelectField
            label={t("promoForm.discountType")}
            options={[
              { value: "percentage", label: t("promoForm.discountPercentage") },
              { value: "fixed_amount", label: t("promoForm.discountFixed") },
            ]}
            selected={form.benefitType}
            onSelect={(value) => {
              update("benefitType", value as "percentage" | "fixed_amount");
              update("benefitValue", "");
            }}
            testIDPrefix="promotion-benefit-type"
          />
        ) : (
          <InfoRow
            label={t("promoForm.discountType")}
            value={benefitLabel(initial as PromotionDetail)}
          />
        )}
        {economicsLocked ? (
          <Notice
            testID="promotion-economics-locked"
            tone="warning"
            title={t("promoForm.economicsLockedTitle")}
            message={t("promoForm.economicsLockedMsg")}
          />
        ) : (
          <>
            <TextField
              label={
                form.benefitType === "percentage"
                  ? t("promoForm.percentOff")
                  : t("promoForm.fixedOff")
              }
              value={form.benefitValue}
              onChangeText={(value) => update("benefitValue", value)}
              placeholder={form.benefitType === "percentage" ? "10" : "25.00"}
              testID="promotion-benefit-value"
            />
            <FieldError value={errors.benefitValue} testID="promotion-benefit-error" />
            {form.benefitType === "fixed_amount" ? (
              <InfoRow
                label={t("promoForm.currency")}
                value={form.currency}
                testID="promotion-currency"
              />
            ) : null}
          </>
        )}
      </Section>

      <Section title={t("promoForm.sectionEligibility")} icon="target">
        {mode === "create" ? (
          <SelectField
            label={t("promoForm.target")}
            options={[
              { value: "order", label: t("promoForm.targetOrder") },
              { value: "variant_scope", label: t("promoForm.targetScope") },
            ]}
            selected={form.targetType}
            onSelect={(value) => update("targetType", value as "order" | "variant_scope")}
            testIDPrefix="promotion-target-type"
          />
        ) : (
          <InfoRow label={t("promoForm.target")} value={targetTypeLabel(form.targetType)} />
        )}
        {mode === "create" && form.targetType === "variant_scope" ? (
          context.access.catalog.canRead ? (
            <>
              <PromotionTargetSelector
                client={client}
                choices={form.targets}
                onChange={(value) => update("targets", value)}
              />
              <FieldError value={errors.targets} testID="promotion-targets-error" />
            </>
          ) : (
            <Body testID="promotion-target-catalog-denied">{t("promoForm.catalogDenied")}</Body>
          )
        ) : null}
        {!economicsLocked ? (
          <>
            <TextField
              label={t("promoForm.minSubtotal")}
              value={form.minimumSubtotal}
              onChangeText={(value) => update("minimumSubtotal", value)}
              placeholder="50.00"
              testID="promotion-minimum-subtotal"
            />
            <FieldError value={errors.minimumSubtotal} />
            <TextField
              label={t("promoForm.maxDiscount")}
              value={form.maximumDiscount}
              onChangeText={(value) => update("maximumDiscount", value)}
              placeholder="100.00"
              testID="promotion-maximum-discount"
            />
            <FieldError value={errors.maximumDiscount} />
            <SelectField
              label={t("promoForm.channel")}
              options={[
                { value: "all", label: t("promoForm.chanAll") },
                { value: "online", label: t("promoForm.chanOnline") },
                { value: "pos", label: t("promoForm.chanPos") },
              ]}
              selected={form.channel}
              onSelect={(value) => update("channel", value as PromotionFormState["channel"])}
              testIDPrefix="promotion-channel"
            />
            <SelectField
              label={t("promoForm.brandRestriction")}
              options={brandOptions}
              selected={form.brandId}
              onSelect={(value) => update("brandId", value)}
              testIDPrefix="promotion-brand"
            />
            <SelectField
              label={t("promoForm.branchRestriction")}
              options={branchOptions}
              selected={form.branchId}
              onSelect={(value) => update("branchId", value)}
              testIDPrefix="promotion-branch"
            />
          </>
        ) : null}
      </Section>

      <Section title={t("promoForm.sectionUsage")} icon="counter">
        {mode === "create" ? (
          <>
            <TextField
              label={t("promoForm.globalLimit")}
              value={form.globalLimit}
              onChangeText={(value) => update("globalLimit", value)}
              placeholder={t("promoForm.unlimited")}
              testID="promotion-global-limit"
            />
            <FieldError value={errors.globalLimit} />
          </>
        ) : (
          <InfoRow
            label={t("promoForm.globalLimitRow")}
            value={form.globalLimit ? form.globalLimit : t("promoForm.unlimited")}
          />
        )}
        {mode === "create" && form.activationType === "code" ? (
          <>
            <TextField
              label={t("promoForm.initialCode")}
              value={form.initialCode}
              onChangeText={(value) => update("initialCode", value.toUpperCase())}
              placeholder="WELCOME10"
              autoCapitalize="characters"
              testID="promotion-initial-code"
            />
            <FieldError value={errors.initialCode} testID="promotion-code-error" />
            <SelectField
              label={t("promoForm.codeUse")}
              options={[
                { value: "unlimited", label: t("promoForm.codeUnlimited") },
                { value: "single", label: t("promoForm.codeSingle") },
                { value: "custom", label: t("promoForm.codeCustom") },
              ]}
              selected={form.codeLimitKind}
              onSelect={(value) =>
                update("codeLimitKind", value as PromotionFormState["codeLimitKind"])
              }
              testIDPrefix="promotion-code-limit"
            />
            {form.codeLimitKind === "custom" ? (
              <>
                <TextField
                  label={t("promoForm.codeLimit")}
                  value={form.codeCustomLimit}
                  onChangeText={(value) => update("codeCustomLimit", value)}
                  testID="promotion-code-custom-limit"
                />
                <FieldError value={errors.codeCustomLimit} />
              </>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title={t("promoForm.sectionSchedule")} icon="calendar-clock-outline">
        <TextField
          label={t("promoForm.startsAt")}
          value={form.startsAt}
          onChangeText={(value) => update("startsAt", value)}
          placeholder="2026-10-01T09:00:00+02:00"
          testID="promotion-starts-at"
        />
        <FieldError value={errors.startsAt} />
        <TextField
          label={t("promoForm.endsAt")}
          value={form.endsAt}
          onChangeText={(value) => update("endsAt", value)}
          placeholder="2026-10-31T23:59:00+02:00"
          testID="promotion-ends-at"
        />
        <FieldError value={errors.endsAt} />
      </Section>

      <Section title={t("promoForm.sectionReview")} icon="clipboard-check-outline">
        <InfoRow label={t("promoForm.activation")} value={activationLabel(form.activationType)} />
        <InfoRow
          label={t("promoForm.benefit")}
          value={`${form.benefitValue || "—"}${form.benefitType === "percentage" ? "%" : ` ${form.currency}`}`}
        />
        <InfoRow label={t("promoForm.target")} value={targetTypeLabel(form.targetType)} />
        <InfoRow
          label={t("promoForm.channel")}
          value={channelLabel(form.channel === "all" ? null : form.channel)}
        />
      </Section>

      {describedError ? (
        <Notice
          tone="danger"
          title={describedError.heading}
          message={describedError.message}
          action={
            describedError.recovery === "retry" ? (
              <PrimaryButton
                label={t("common.retrySafely")}
                icon="refresh"
                testID="promotion-submit-retry"
                onPress={mutation.retry}
              />
            ) : describedError.recovery === "edit" || describedError.recovery === "replace" ? (
              <PrimaryButton
                label={t("promoForm.editDetails")}
                icon="pencil-outline"
                testID="promotion-submit-edit"
                onPress={mutation.reset}
              />
            ) : undefined
          }
        />
      ) : null}
      <PrimaryButton
        label={
          mutation.state.status === "submitting"
            ? t("common.saving")
            : mode === "create"
              ? t("promoForm.createTitle")
              : t("common.saveChanges")
        }
        testID="promotion-submit"
        icon={mode === "create" ? "ticket-confirmation-outline" : "content-save-outline"}
        disabled={mutation.state.status === "submitting"}
        onPress={submit}
      />
    </ScrollScreen>
  );
}

function Section({
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

function FieldError({ value, testID }: { value?: string; testID?: string }) {
  return <ThemedFieldError message={value} testID={testID} />;
}

function contextBrandOptions(context: MeContextResponse): SelectOption[] {
  const byId = new Map<string, string>();
  for (const brand of [...context.access.catalog.brands, ...context.access.orders.brands]) {
    byId.set(brand.id, brand.name);
  }
  return [
    { value: "", label: t("promoForm.allBrands") },
    ...[...byId].map(([value, label]) => ({ value, label })),
  ];
}

function contextBranchOptions(context: MeContextResponse): SelectOption[] {
  return [
    { value: "", label: t("promoForm.allBranches") },
    ...context.access.orders.branches.map((branch) => ({ value: branch.id, label: branch.name })),
  ];
}
