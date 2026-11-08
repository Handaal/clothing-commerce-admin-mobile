import type { PromotionSummary } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
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
  const { t } = useI18n();
  if (!canRead) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("promotions.eyebrow")}
          title={t("promotions.title")}
          description={t("promotions.accessDesc")}
          icon="ticket-percent-outline"
          onBack={onBack}
        />
        <Notice
          tone="warning"
          title={t("promotions.accessTitle")}
          message={t("promotions.accessBody")}
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
  const { t } = useI18n();
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
        eyebrow={t("promotions.eyebrow")}
        title={t("promotions.title")}
        description={t("promotions.headerDesc")}
        icon="ticket-percent-outline"
        onBack={onBack}
      />

      {canManage ? (
        <Surface tone="brand">
          <SectionHeading
            title={t("promotions.workspaceTitle")}
            detail={t("common.serverAuthoritative")}
          />
          <Body>{t("promotions.workspaceBody")}</Body>
          <PrimaryButton
            label={t("promotions.createCta")}
            icon="plus"
            testID="create-promotion"
            onPress={onCreatePromotion}
          />
        </Surface>
      ) : (
        <Notice testID="promotions-read-only" message={t("promotions.readOnly")} />
      )}

      {state.status === "success" ? (
        <View style={promotionStyles.metrics}>
          <MetricCard
            label={t("promotions.loadedOffers")}
            value={String(state.data.length)}
            icon="ticket-percent-outline"
          />
          <MetricCard
            label={t("promotions.activeMetric")}
            value={String(activeCount)}
            icon="check-circle-outline"
            tone="accent"
          />
        </View>
      ) : null}

      <SectionHeading
        title={t("promotions.catalogHeading")}
        detail={
          state.status === "success" ? t("common.shown", { count: state.data.length }) : undefined
        }
      />
      {state.status === "loading" ? <LoadingBlock label={t("promotions.loading")} /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <PrimaryButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <View testID="promotions-empty">
          <EmptyState
            icon="ticket-percent-outline"
            title={t("promotions.emptyTitle")}
            message={t("promotions.emptyBody")}
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
  const { t } = useI18n();
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
      <InfoRow
        label={t("promotions.activation")}
        value={activationLabel(promotion.activationType)}
      />
      <InfoRow label={t("promotions.target")} value={targetTypeLabel(promotion.targetType)} />
      <InfoRow label={t("promotions.channel")} value={channelLabel(promotion.channel)} />
      <InfoRow
        label={t("promotions.usage")}
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
