import type { PromotionSummary } from "@shifted/clothing-commerce-sdk";
import { useCallback } from "react";
import { View } from "react-native";

import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  Divider,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { PromotionClient } from "./client";
import {
  activationLabel,
  benefitLabel,
  channelLabel,
  effectiveStateLabel,
  promotionSummaryState,
  targetTypeLabel,
  usageLabel,
} from "./display";
import { loadAllPromotions } from "./load";

export function PromotionsListScreen({
  client,
  canRead,
  canManage,
  onOpenPromotion,
  onCreatePromotion,
  onBack,
}: {
  client: Pick<PromotionClient, "listPromotions">;
  canRead: boolean;
  canManage: boolean;
  onOpenPromotion: (promotionId: string) => void;
  onCreatePromotion: () => void;
  onBack: () => void;
}) {
  if (!canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Promotions" title="Promotions" onBack={onBack} />
        <Body>You do not have Promotion read access.</Body>
      </ScrollScreen>
    );
  }
  return (
    <PromotionsListContent
      client={client}
      canManage={canManage}
      onOpenPromotion={onOpenPromotion}
      onCreatePromotion={onCreatePromotion}
      onBack={onBack}
    />
  );
}

function PromotionsListContent({
  client,
  canManage,
  onOpenPromotion,
  onCreatePromotion,
  onBack,
}: {
  client: Pick<PromotionClient, "listPromotions">;
  canManage: boolean;
  onOpenPromotion: (promotionId: string) => void;
  onCreatePromotion: () => void;
  onBack: () => void;
}) {
  const load = useCallback(() => loadAllPromotions(client), [client]);
  const { state, reload } = useAsync<PromotionSummary[]>(load);

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Promotions" title="Promotions" onBack={onBack} />
      {canManage ? (
        <PrimaryButton
          label="Create Promotion"
          testID="create-promotion"
          onPress={onCreatePromotion}
        />
      ) : (
        <Body testID="promotions-read-only">Read-only access · management actions are hidden.</Body>
      )}
      <Divider />
      {state.status === "loading" ? <LoadingBlock label="Loading Promotions…" /> : null}
      {state.status === "error" ? (
        <>
          <Title>{errorHeading(state.error.kind)}</Title>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label="Try again" onPress={reload} />
          ) : null}
        </>
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <Body testID="promotions-empty">No Promotions yet.</Body>
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <View style={{ gap: 12 }}>
          {state.data.map((promotion) => (
            <PromotionRow
              key={promotion.id}
              promotion={promotion}
              onOpen={() => onOpenPromotion(promotion.id)}
            />
          ))}
        </View>
      ) : null}
    </ScrollScreen>
  );
}

function PromotionRow({ promotion, onOpen }: { promotion: PromotionSummary; onOpen: () => void }) {
  return (
    <PressableRow testID={`promotion-row-${promotion.id}`} onPress={onOpen}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Title>{promotion.name}</Title>
        <Badge
          label={effectiveStateLabel(promotionSummaryState(promotion))}
          testID={`promotion-status-${promotion.id}`}
        />
      </View>
      <InfoRow label="Activation" value={activationLabel(promotion.activationType)} />
      <InfoRow label="Benefit" value={benefitLabel(promotion)} />
      <InfoRow label="Target" value={targetTypeLabel(promotion.targetType)} />
      <InfoRow label="Channel" value={channelLabel(promotion.channel)} />
      <InfoRow
        label="Usage"
        value={usageLabel(promotion.redemptionCount, promotion.globalRedemptionLimit)}
      />
    </PressableRow>
  );
}
