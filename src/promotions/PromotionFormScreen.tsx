import type { MeContextResponse, PromotionDetail } from "@shifted/clothing-commerce-sdk";
import { useCallback } from "react";

import { errorHeading, isRetryable } from "../products/display";
import { LoadingBlock, Notice, PageHeader, PrimaryButton, ScrollScreen } from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { IdempotencyKeyFactory } from "../inventory/idempotency";
import type { PromotionClient } from "./client";
import { PromotionForm, type PromotionFormMode } from "./PromotionForm";

export function PromotionFormScreen({
  mode,
  client,
  context,
  canManage,
  promotionId,
  onSaved,
  onBack,
  generateIdempotencyKey,
}: {
  mode: PromotionFormMode;
  client: PromotionClient;
  context: MeContextResponse;
  canManage: boolean;
  promotionId?: string;
  onSaved: (promotion: PromotionDetail) => void;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}) {
  if (mode === "create") {
    return (
      <PromotionForm
        mode="create"
        client={client}
        context={context}
        canManage={canManage}
        onSaved={onSaved}
        onBack={onBack}
        generateIdempotencyKey={generateIdempotencyKey}
      />
    );
  }

  return (
    <EditPromotionLoader
      client={client}
      context={context}
      canManage={canManage}
      promotionId={promotionId as string}
      onSaved={onSaved}
      onBack={onBack}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}

function EditPromotionLoader({
  client,
  context,
  canManage,
  promotionId,
  onSaved,
  onBack,
  generateIdempotencyKey,
}: {
  client: PromotionClient;
  context: MeContextResponse;
  canManage: boolean;
  promotionId: string;
  onSaved: (promotion: PromotionDetail) => void;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}) {
  const load = useCallback(() => client.getPromotion(promotionId), [client, promotionId]);
  const { state, reload } = useAsync<PromotionDetail>(load);

  if (!canManage) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow="Promotions"
          title="Read-only access"
          icon="ticket-percent-outline"
          onBack={onBack}
        />
        <Notice message="You can read this Promotion, but editing is not available." />
      </ScrollScreen>
    );
  }
  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow="Promotions"
          title="Edit Promotion"
          icon="pencil-outline"
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
          eyebrow="Promotions"
          title={errorHeading(state.error.kind)}
          icon="alert-circle-outline"
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
  return (
    <PromotionForm
      mode="edit"
      client={client}
      context={context}
      canManage={canManage}
      initial={state.data}
      onSaved={onSaved}
      onBack={onBack}
      generateIdempotencyKey={generateIdempotencyKey}
    />
  );
}
