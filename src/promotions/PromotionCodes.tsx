import type { PromotionDetail } from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  Badge,
  Body,
  ConfirmButton,
  EmptyState,
  InfoRow,
  Notice,
  PrimaryButton,
  SectionHeading,
  SelectField,
  Surface,
  SurfaceRow,
  TextField,
} from "../ui/components";
import { useToast } from "../ui/Toast";
import { useMutation } from "../ui/useMutation";
import type { PromotionClient } from "./client";
import type { PromotionLimitKind } from "./form";
import { describePromotionWriteError } from "./write-errors";

export function PromotionCodes({
  client,
  promotion,
  canManage,
  onChanged,
  generateIdempotencyKey = secureIdempotencyKey,
}: {
  client: Pick<PromotionClient, "createPromotionCode" | "setPromotionCodeStatus">;
  promotion: PromotionDetail;
  canManage: boolean;
  onChanged: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [limitKind, setLimitKind] = useState<PromotionLimitKind>("unlimited");
  const [customLimit, setCustomLimit] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const createProducer = useCallback(
    (input: { code: string; maxRedemptions: number | null }, idempotencyKey: string) =>
      client.createPromotionCode({
        promotionId: promotion.id,
        ...input,
        idempotencyKey,
      }),
    [client, promotion.id],
  );
  const statusProducer = useCallback(
    (codeId: string, idempotencyKey: string) =>
      client.setPromotionCodeStatus({ codeId, status: "disabled", idempotencyKey }),
    [client],
  );
  const toast = useToast();
  const createMutation = useMutation(createProducer, generateIdempotencyKey, {
    onSuccess: () =>
      toast.success(t("promoCodes.createdToast"), { title: t("promoCodes.codeAdded") }),
    onError: (error) => {
      const described = describePromotionWriteError(error);
      toast.error(described.message, { title: described.heading });
    },
  });
  const statusMutation = useMutation(statusProducer, generateIdempotencyKey, {
    onSuccess: () =>
      toast.success(t("promoCodes.disabledToast"), { title: t("promoCodes.codeUpdated") }),
    onError: (error) => {
      const described = describePromotionWriteError(error);
      toast.error(described.message, { title: described.heading });
    },
  });

  useEffect(() => {
    if (createMutation.state.status === "success") onChanged();
  }, [createMutation.state.status, onChanged]);
  useEffect(() => {
    if (statusMutation.state.status === "success") onChanged();
  }, [onChanged, statusMutation.state.status]);

  function submitCode() {
    const normalized = code.trim().toUpperCase();
    if (!normalized || !/^[A-Z0-9_-]+$/.test(normalized)) {
      setValidationError(t("promoCodes.validFormat"));
      toast.error(t("common.fixHighlightedSave"));
      return;
    }
    let maxRedemptions: number | null = null;
    if (limitKind === "single") maxRedemptions = 1;
    if (limitKind === "custom") {
      const value = Number(customLimit);
      if (!/^\d+$/.test(customLimit) || !Number.isSafeInteger(value) || value <= 0) {
        setValidationError(t("promoCodes.validLimit"));
        return;
      }
      maxRedemptions = value;
    }
    setValidationError(null);
    createMutation.submit({ code: normalized, maxRedemptions });
  }

  const createError =
    createMutation.state.status === "error"
      ? describePromotionWriteError(createMutation.state.error)
      : undefined;
  const statusError =
    statusMutation.state.status === "error"
      ? describePromotionWriteError(statusMutation.state.error)
      : undefined;

  return (
    <View style={{ gap: 12 }}>
      {promotion.codes.length === 0 ? (
        <EmptyState
          icon="ticket-outline"
          title={t("promoCodes.emptyTitle")}
          message={t("promoCodes.emptyBody")}
        />
      ) : null}
      {promotion.codes.map((item) => (
        <SurfaceRow key={item.id} testID={`promotion-code-${item.id}`}>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Body>{item.code}</Body>
            <Badge
              label={item.status}
              tone={item.status === "active" ? "success" : "neutral"}
              testID={`promotion-code-status-${item.id}`}
            />
          </View>
          <InfoRow
            label={t("promoCodes.use")}
            value={
              item.maxRedemptions === 1
                ? t("promoCodes.singleUse")
                : item.maxRedemptions === null
                  ? t("promoCodes.reusableUnlimited")
                  : t("promoCodes.reusableCapped", { count: item.maxRedemptions })
            }
          />
          <InfoRow label={t("promoCodes.redeemed")} value={String(item.redemptionCount)} />
          <InfoRow
            label={t("promoCodes.remaining")}
            value={
              item.remainingRedemptions === null
                ? t("promoCodes.unlimited")
                : String(item.remainingRedemptions)
            }
          />
          {canManage && item.status === "active" ? (
            <ConfirmButton
              label={t("promoCodes.disable")}
              confirmLabel={t("promoCodes.confirmDisable")}
              testID={`promotion-code-disable-${item.id}`}
              disabled={statusMutation.state.status === "submitting"}
              onConfirm={() => statusMutation.submit(item.id)}
            />
          ) : null}
        </SurfaceRow>
      ))}

      {statusError ? (
        <MutationError described={statusError} onRetry={statusMutation.retry} />
      ) : null}

      {canManage ? (
        <Surface>
          <SectionHeading
            title={t("promoCodes.createTitle")}
            detail={t("promoCodes.voucherAccess")}
          />
          <TextField
            label={t("promoCodes.codeLabel")}
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            placeholder="WELCOME10"
            testID="promotion-new-code"
            autoCapitalize="characters"
          />
          <SelectField
            label={t("promoCodes.codeUse")}
            options={[
              { value: "unlimited", label: t("promoForm.codeUnlimited") },
              { value: "single", label: t("promoForm.codeSingle") },
              { value: "custom", label: t("promoForm.codeCustom") },
            ]}
            selected={limitKind}
            onSelect={(value) => setLimitKind(value as PromotionLimitKind)}
            testIDPrefix="promotion-new-code-limit"
          />
          {limitKind === "custom" ? (
            <TextField
              label={t("promoCodes.redemptionLimit")}
              value={customLimit}
              onChangeText={setCustomLimit}
              testID="promotion-new-code-custom-limit"
            />
          ) : null}
          {validationError ? (
            <Body testID="promotion-new-code-error">{validationError}</Body>
          ) : null}
          {createError ? (
            <MutationError described={createError} onRetry={createMutation.retry} />
          ) : null}
          <PrimaryButton
            label={
              createMutation.state.status === "submitting"
                ? t("promoCodes.creating")
                : t("promoCodes.createCode")
            }
            testID="promotion-create-code"
            icon="ticket-confirmation-outline"
            disabled={createMutation.state.status === "submitting"}
            onPress={submitCode}
          />
        </Surface>
      ) : null}
    </View>
  );
}

function MutationError({
  described,
  onRetry,
}: {
  described: ReturnType<typeof describePromotionWriteError>;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <Notice
      tone="danger"
      title={described.heading}
      message={described.message}
      action={
        described.recovery === "retry" ? (
          <PrimaryButton label={t("common.retrySafely")} icon="refresh" onPress={onRetry} />
        ) : undefined
      }
    />
  );
}
