import type { PromotionSummary } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { errorHeading, isRetryable } from "../products/display";
import {
  Badge,
  Body,
  EmptyState,
  InfoRow,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  Surface,
} from "../ui/components";
import { AppIcon } from "../ui/Icon";
import { colors, radius, spacing } from "../ui/theme";
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
        <PageHeader
          eyebrow="Growth"
          title="Promotions & vouchers"
          description="Manage server-authoritative offers and redemption controls."
          icon="ticket-percent-outline"
          onBack={onBack}
        />
        <Notice
          tone="warning"
          title="Promotion access required"
          message="You do not have Promotion read access."
        />
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
  const activeCount = useMemo(
    () =>
      state.status === "success"
        ? state.data.filter((promotion) => promotion.status === "active").length
        : 0,
    [state],
  );

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow="Growth"
        title="Promotions & vouchers"
        description="Create and monitor offers across POS and online channels."
        icon="ticket-percent-outline"
        onBack={onBack}
      />

      {canManage ? (
        <Surface tone="brand">
          <SectionHeading title="Promotion workspace" detail="Server-authoritative" />
          <Body>
            Configure discounts, eligibility, schedules and voucher codes. The Commerce API decides
            sale-time eligibility and final amounts.
          </Body>
          <PrimaryButton
            label="Create Promotion"
            icon="plus"
            testID="create-promotion"
            onPress={onCreatePromotion}
          />
        </Surface>
      ) : (
        <Notice
          testID="promotions-read-only"
          message="Read-only access · management actions are hidden."
        />
      )}

      {state.status === "success" ? (
        <View style={promotionStyles.metrics}>
          <MetricCard
            label="Loaded offers"
            value={String(state.data.length)}
            icon="ticket-percent-outline"
          />
          <MetricCard
            label="Active"
            value={String(activeCount)}
            icon="check-circle-outline"
            tone="accent"
          />
        </View>
      ) : null}

      <SectionHeading
        title="Promotion catalog"
        detail={state.status === "success" ? `${state.data.length} shown` : undefined}
      />
      {state.status === "loading" ? <LoadingBlock label="Loading Promotions…" /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label="Try again" icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <View testID="promotions-empty">
          <EmptyState
            icon="ticket-percent-outline"
            title="No offers configured"
            message="No Promotions yet."
          />
        </View>
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <View style={promotionStyles.list}>
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
      <View style={promotionStyles.lead}>
        <View style={promotionStyles.icon}>
          <AppIcon
            name={promotion.activationType === "code" ? "ticket-confirmation-outline" : "auto-fix"}
            size={22}
            color={colors.brand}
          />
        </View>
        <View style={promotionStyles.copy}>
          <View style={promotionStyles.titleRow}>
            <Text style={promotionStyles.name}>{promotion.name}</Text>
            <Badge
              label={effectiveStateLabel(promotionSummaryState(promotion))}
              testID={`promotion-status-${promotion.id}`}
            />
          </View>
          <Body>{benefitLabel(promotion)}</Body>
        </View>
      </View>
      <InfoRow label="Activation" value={activationLabel(promotion.activationType)} />
      <InfoRow label="Target" value={targetTypeLabel(promotion.targetType)} />
      <InfoRow label="Channel" value={channelLabel(promotion.channel)} />
      <InfoRow
        label="Usage"
        value={usageLabel(promotion.redemptionCount, promotion.globalRedemptionLimit)}
      />
    </PressableRow>
  );
}

const promotionStyles = StyleSheet.create({
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  list: { gap: spacing.md },
  lead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  icon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  copy: { flex: 1, gap: spacing.xs },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  name: { flex: 1, color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: "800" },
});
