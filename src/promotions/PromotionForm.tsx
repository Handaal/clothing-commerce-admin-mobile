import type {
  CreatePromotionRequest,
  MeContextResponse,
  PromotionDetail,
  UpdatePromotionRequest,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  TextField,
  Title,
  type SelectOption,
} from "../ui/components";
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
  const mutation = useMutation(producer, generateIdempotencyKey);
  const brandOptions = useMemo(() => contextBrandOptions(context), [context]);
  const branchOptions = useMemo(() => contextBranchOptions(context), [context]);

  if (!canManage) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Promotions" title="Read-only access" onBack={onBack} />
        <Body>You can read Promotions, but management actions are not available.</Body>
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
          eyebrow="Promotions"
          title={mode === "create" ? "Promotion created" : "Promotion updated"}
          onBack={onBack}
        />
        <Body>The Commerce API accepted the change.</Body>
        <PrimaryButton
          label="Continue"
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
    if (Object.values(nextErrors).some(Boolean)) return;
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
        eyebrow="Promotions"
        title={mode === "create" ? "Create Promotion" : "Edit Promotion"}
        onBack={onBack}
      />

      <Section title="Basics">
        <TextField
          label="Name"
          value={form.name}
          onChangeText={(value) => update("name", value)}
          placeholder="Weekend offer"
          testID="promotion-name"
        />
        <FieldError value={errors.name} testID="promotion-name-error" />
        <TextField
          label="Description (optional)"
          value={form.description}
          onChangeText={(value) => update("description", value)}
          multiline
          testID="promotion-description"
        />
        <FieldError value={errors.description} />
        {mode === "create" ? (
          <>
            <SelectField
              label="Activation"
              options={[
                { value: "automatic", label: "Automatic" },
                { value: "code", label: "Promotion code" },
              ]}
              selected={form.activationType}
              onSelect={(value) => update("activationType", value as "automatic" | "code")}
              testIDPrefix="promotion-activation"
            />
            <SelectField
              label="Initial lifecycle"
              options={[
                { value: "inactive", label: "Inactive · review first" },
                { value: "active", label: "Active" },
              ]}
              selected={form.status}
              onSelect={(value) => update("status", value as "active" | "inactive")}
              testIDPrefix="promotion-status"
            />
          </>
        ) : (
          <InfoRow label="Activation" value={activationLabel(form.activationType)} />
        )}
      </Section>

      <Section title="Benefit">
        {mode === "create" ? (
          <SelectField
            label="Discount type"
            options={[
              { value: "percentage", label: "Percentage" },
              { value: "fixed_amount", label: "Fixed amount" },
            ]}
            selected={form.benefitType}
            onSelect={(value) => {
              update("benefitType", value as "percentage" | "fixed_amount");
              update("benefitValue", "");
            }}
            testIDPrefix="promotion-benefit-type"
          />
        ) : (
          <InfoRow label="Discount type" value={benefitLabel(initial as PromotionDetail)} />
        )}
        {economicsLocked ? (
          <Body testID="promotion-economics-locked">
            Discount economics are locked because this Promotion has been redeemed. You can still
            edit its name, description, and schedule. Deactivate it and create a new Promotion to
            change the discount.
          </Body>
        ) : (
          <>
            <TextField
              label={form.benefitType === "percentage" ? "Percentage off" : "Fixed amount off"}
              value={form.benefitValue}
              onChangeText={(value) => update("benefitValue", value)}
              placeholder={form.benefitType === "percentage" ? "10" : "25.00"}
              testID="promotion-benefit-value"
            />
            <FieldError value={errors.benefitValue} testID="promotion-benefit-error" />
            {form.benefitType === "fixed_amount" ? (
              mode === "create" ? (
                <>
                  <TextField
                    label="Currency"
                    value={form.currency}
                    onChangeText={(value) => update("currency", value.toUpperCase())}
                    placeholder="USD"
                    testID="promotion-currency"
                    autoCapitalize="characters"
                  />
                  <FieldError value={errors.currency} />
                </>
              ) : (
                <InfoRow label="Currency" value={form.currency} />
              )
            ) : null}
          </>
        )}
      </Section>

      <Section title="Eligibility">
        {mode === "create" ? (
          <SelectField
            label="Target"
            options={[
              { value: "order", label: "Whole order" },
              { value: "variant_scope", label: "Selected Products / Variants" },
            ]}
            selected={form.targetType}
            onSelect={(value) => update("targetType", value as "order" | "variant_scope")}
            testIDPrefix="promotion-target-type"
          />
        ) : (
          <InfoRow label="Target" value={targetTypeLabel(form.targetType)} />
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
            <Body testID="promotion-target-catalog-denied">
              Product and Variant targeting requires Catalog read access. Choose whole order or ask
              an administrator for access.
            </Body>
          )
        ) : null}
        {!economicsLocked ? (
          <>
            <TextField
              label="Minimum subtotal (optional, order currency)"
              value={form.minimumSubtotal}
              onChangeText={(value) => update("minimumSubtotal", value)}
              placeholder="50.00"
              testID="promotion-minimum-subtotal"
            />
            <FieldError value={errors.minimumSubtotal} />
            <TextField
              label="Maximum discount (optional, order currency)"
              value={form.maximumDiscount}
              onChangeText={(value) => update("maximumDiscount", value)}
              placeholder="100.00"
              testID="promotion-maximum-discount"
            />
            <FieldError value={errors.maximumDiscount} />
            <SelectField
              label="Channel"
              options={[
                { value: "all", label: "All channels" },
                { value: "online", label: "Online" },
                { value: "pos", label: "POS" },
              ]}
              selected={form.channel}
              onSelect={(value) => update("channel", value as PromotionFormState["channel"])}
              testIDPrefix="promotion-channel"
            />
            <SelectField
              label="Brand restriction"
              options={brandOptions}
              selected={form.brandId}
              onSelect={(value) => update("brandId", value)}
              testIDPrefix="promotion-brand"
            />
            <SelectField
              label="Branch restriction"
              options={branchOptions}
              selected={form.branchId}
              onSelect={(value) => update("branchId", value)}
              testIDPrefix="promotion-branch"
            />
          </>
        ) : null}
      </Section>

      <Section title="Usage">
        {mode === "create" ? (
          <>
            <TextField
              label="Global redemption limit (optional)"
              value={form.globalLimit}
              onChangeText={(value) => update("globalLimit", value)}
              placeholder="Unlimited"
              testID="promotion-global-limit"
            />
            <FieldError value={errors.globalLimit} />
          </>
        ) : (
          <InfoRow label="Global limit" value={form.globalLimit ? form.globalLimit : "Unlimited"} />
        )}
        {mode === "create" && form.activationType === "code" ? (
          <>
            <TextField
              label="Initial Promotion code"
              value={form.initialCode}
              onChangeText={(value) => update("initialCode", value.toUpperCase())}
              placeholder="WELCOME10"
              autoCapitalize="characters"
              testID="promotion-initial-code"
            />
            <FieldError value={errors.initialCode} testID="promotion-code-error" />
            <SelectField
              label="Code use"
              options={[
                { value: "unlimited", label: "Reusable · unlimited" },
                { value: "single", label: "Single-use voucher" },
                { value: "custom", label: "Reusable · capped" },
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
                  label="Code redemption limit"
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

      <Section title="Schedule">
        <TextField
          label="Starts at (optional)"
          value={form.startsAt}
          onChangeText={(value) => update("startsAt", value)}
          placeholder="2026-10-01T09:00:00+02:00"
          testID="promotion-starts-at"
        />
        <FieldError value={errors.startsAt} />
        <TextField
          label="Ends at (optional)"
          value={form.endsAt}
          onChangeText={(value) => update("endsAt", value)}
          placeholder="2026-10-31T23:59:00+02:00"
          testID="promotion-ends-at"
        />
        <FieldError value={errors.endsAt} />
      </Section>

      <Section title="Review">
        <InfoRow label="Activation" value={activationLabel(form.activationType)} />
        <InfoRow
          label="Benefit"
          value={`${form.benefitValue || "—"}${form.benefitType === "percentage" ? "%" : ` ${form.currency}`}`}
        />
        <InfoRow label="Target" value={targetTypeLabel(form.targetType)} />
        <InfoRow
          label="Channel"
          value={channelLabel(form.channel === "all" ? null : form.channel)}
        />
      </Section>

      {describedError ? (
        <View style={{ gap: 8 }}>
          <Title>{describedError.heading}</Title>
          <Body>{describedError.message}</Body>
          {describedError.recovery === "retry" ? (
            <PrimaryButton
              label="Retry safely"
              testID="promotion-submit-retry"
              onPress={mutation.retry}
            />
          ) : null}
          {describedError.recovery === "edit" || describedError.recovery === "replace" ? (
            <PrimaryButton
              label="Edit details"
              testID="promotion-submit-edit"
              onPress={mutation.reset}
            />
          ) : null}
        </View>
      ) : null}
      <PrimaryButton
        label={
          mutation.state.status === "submitting"
            ? "Saving…"
            : mode === "create"
              ? "Create Promotion"
              : "Save changes"
        }
        testID="promotion-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={submit}
      />
    </ScrollScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <Divider />
      <Eyebrow>{title}</Eyebrow>
      {children}
    </View>
  );
}

function FieldError({ value, testID }: { value?: string; testID?: string }) {
  return value ? <Body testID={testID}>{value}</Body> : null;
}

function contextBrandOptions(context: MeContextResponse): SelectOption[] {
  const byId = new Map<string, string>();
  for (const brand of [...context.access.catalog.brands, ...context.access.orders.brands]) {
    byId.set(brand.id, brand.name);
  }
  return [
    { value: "", label: "All brands" },
    ...[...byId].map(([value, label]) => ({ value, label })),
  ];
}

function contextBranchOptions(context: MeContextResponse): SelectOption[] {
  return [
    { value: "", label: "All branches" },
    ...context.access.orders.branches.map((branch) => ({ value: branch.id, label: branch.name })),
  ];
}
