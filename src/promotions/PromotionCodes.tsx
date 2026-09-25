import type { PromotionDetail } from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";

import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  Badge,
  Body,
  ConfirmButton,
  InfoRow,
  PrimaryButton,
  SelectField,
  SurfaceRow,
  TextField,
  Title,
} from "../ui/components";
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
  const createMutation = useMutation(createProducer, generateIdempotencyKey);
  const statusMutation = useMutation(statusProducer, generateIdempotencyKey);

  useEffect(() => {
    if (createMutation.state.status === "success") onChanged();
  }, [createMutation.state.status, onChanged]);
  useEffect(() => {
    if (statusMutation.state.status === "success") onChanged();
  }, [onChanged, statusMutation.state.status]);

  function submitCode() {
    const normalized = code.trim().toUpperCase();
    if (!normalized || !/^[A-Z0-9_-]+$/.test(normalized)) {
      setValidationError("Use letters, numbers, underscores, and hyphens.");
      return;
    }
    let maxRedemptions: number | null = null;
    if (limitKind === "single") maxRedemptions = 1;
    if (limitKind === "custom") {
      const value = Number(customLimit);
      if (!/^\d+$/.test(customLimit) || !Number.isSafeInteger(value) || value <= 0) {
        setValidationError("Enter a code redemption limit greater than zero.");
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
      {promotion.codes.length === 0 ? <Body>No codes created.</Body> : null}
      {promotion.codes.map((item) => (
        <SurfaceRow key={item.id} testID={`promotion-code-${item.id}`}>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Title>{item.code}</Title>
            <Badge label={item.status} testID={`promotion-code-status-${item.id}`} />
          </View>
          <InfoRow
            label="Use"
            value={
              item.maxRedemptions === 1
                ? "Single-use voucher"
                : item.maxRedemptions === null
                  ? "Reusable · unlimited"
                  : `Reusable · ${item.maxRedemptions} uses`
            }
          />
          <InfoRow label="Redeemed" value={String(item.redemptionCount)} />
          <InfoRow
            label="Remaining"
            value={
              item.remainingRedemptions === null ? "Unlimited" : String(item.remainingRedemptions)
            }
          />
          {canManage && item.status === "active" ? (
            <ConfirmButton
              label="Disable code"
              confirmLabel="Confirm disable"
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
        <View style={{ gap: 12 }}>
          <Title>Create code</Title>
          <TextField
            label="Code"
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            placeholder="WELCOME10"
            testID="promotion-new-code"
            autoCapitalize="characters"
          />
          <SelectField
            label="Code use"
            options={[
              { value: "unlimited", label: "Reusable · unlimited" },
              { value: "single", label: "Single-use voucher" },
              { value: "custom", label: "Reusable · capped" },
            ]}
            selected={limitKind}
            onSelect={(value) => setLimitKind(value as PromotionLimitKind)}
            testIDPrefix="promotion-new-code-limit"
          />
          {limitKind === "custom" ? (
            <TextField
              label="Redemption limit"
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
            label={createMutation.state.status === "submitting" ? "Creating…" : "Create code"}
            testID="promotion-create-code"
            disabled={createMutation.state.status === "submitting"}
            onPress={submitCode}
          />
        </View>
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
  return (
    <View style={{ gap: 8 }}>
      <Title>{described.heading}</Title>
      <Body>{described.message}</Body>
      {described.recovery === "retry" ? (
        <PrimaryButton label="Retry safely" onPress={onRetry} />
      ) : null}
    </View>
  );
}
