import { useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { directionalIcon, useI18n } from "../i18n";
import { formatMoneyMinor } from "../products/display";
import type { ReportingAdapter } from "../reporting/adapter";
import type { DashboardReport, TrendPoint } from "../reporting/model";
import {
  Body,
  LoadingBlock,
  Notice,
  SectionHeading,
  Surface,
  TextButton,
  webLift,
} from "../ui/components";
import { AppIcon, type AppIconName } from "../ui/Icon";
import { colors, radius, spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";

interface OwnerOverviewProps {
  adapter: ReportingAdapter;
  onOpenReports: () => void;
  onOpenProductsReport: () => void;
  onOpenReturnsReport: () => void;
}

/**
 * A deliberately small owner snapshot. It consumes only the canonical reporting adapter, keeps
 * currencies separate, and leaves the complete reporting context on the Reports screens.
 */
export function OwnerOverview({
  adapter,
  onOpenReports,
  onOpenProductsReport,
  onOpenReturnsReport,
}: OwnerOverviewProps) {
  const { t } = useI18n();
  const load = useCallback(() => adapter.getDashboard({ range: { preset: "7-days" } }), [adapter]);
  const { state, reload } = useAsync(load);

  return (
    <View style={styles.section}>
      <SectionHeading title={t("home.overviewTitle")} detail={t("home.lastSevenDays")} />
      {state.status === "loading" ? <LoadingBlock label={t("home.loadingOverview")} /> : null}
      {state.status === "error" ? (
        <Notice
          tone="warning"
          title={t("home.overviewUnavailable")}
          message={t("home.overviewUnavailableBody")}
          action={<TextButton label={t("common.retry")} icon="refresh" onPress={reload} />}
        />
      ) : null}
      {state.status === "success" ? (
        <OverviewData
          data={state.data}
          onOpenReports={onOpenReports}
          onOpenProductsReport={onOpenProductsReport}
          onOpenReturnsReport={onOpenReturnsReport}
        />
      ) : null}
    </View>
  );
}

function OverviewData({
  data,
  onOpenReports,
  onOpenProductsReport,
  onOpenReturnsReport,
}: {
  data: DashboardReport;
  onOpenReports: () => void;
  onOpenProductsReport: () => void;
  onOpenReturnsReport: () => void;
}) {
  const { t, isRTL } = useI18n();
  const primary = data.currencies[0];
  const additionalCurrencyCount = Math.max(0, data.currencies.length - 1);
  const pendingRefunds = primary?.returns.pendingRefundMinor ?? 0;
  const needsAttention = data.noSalesWithCurrentStock.length > 0 || pendingRefunds > 0;

  if (!primary) {
    return (
      <Surface style={styles.emptyOverview}>
        <View style={styles.emptyIcon}>
          <AppIcon name="chart-line" size={24} color={colors.brand} />
        </View>
        <View style={styles.emptyCopy}>
          <Text style={styles.emptyTitle}>{t("home.noSalesTitle")}</Text>
          <Body>{t("home.noSalesBody")}</Body>
        </View>
        <TextButton
          label={t("home.openReports")}
          icon={directionalIcon("arrow-right", isRTL)}
          onPress={onOpenReports}
        />
      </Surface>
    );
  }

  return (
    <View style={styles.overviewStack}>
      <Surface style={styles.performanceCard}>
        <View style={styles.performanceHeader}>
          <View style={styles.performanceCopy}>
            <Text style={styles.performanceEyebrow}>
              {t("home.salesCurrency", { currency: primary.currency })}
            </Text>
            <Text testID="owner-net-sales" style={styles.performanceValue}>
              {formatMoneyMinor(primary.sales.netMinor, primary.currency)}
            </Text>
            <Text style={styles.performanceCaption}>
              {t("home.netSalesWithOrders", { count: primary.sales.orders })}
            </Text>
          </View>
          <View style={styles.stockMetric}>
            <View style={styles.stockIcon}>
              <AppIcon name="package-variant-closed" size={19} color={colors.accent} />
            </View>
            <Text style={styles.stockValue}>{data.stock.totalOnHand}</Text>
            <Text style={styles.stockLabel}>{t("home.unitsOnHand")}</Text>
          </View>
        </View>

        <TrendBars points={primary.trend} currency={primary.currency} />

        <View style={styles.performanceFooter}>
          {additionalCurrencyCount > 0 ? (
            <Text style={styles.currencyNote}>
              {t("home.moreCurrencies", { count: additionalCurrencyCount })}
            </Text>
          ) : (
            <Text style={styles.currencyNote}>{t("home.reportingPeriod")}</Text>
          )}
          <TextButton
            label={t("home.openReports")}
            icon={directionalIcon("arrow-right", isRTL)}
            onPress={onOpenReports}
          />
        </View>
      </Surface>

      {needsAttention ? (
        <Surface tone="muted" style={styles.attentionCard}>
          <View style={styles.attentionHeading}>
            <View style={styles.attentionIcon}>
              <AppIcon name="lightning-bolt-outline" size={20} color={colors.warning} />
            </View>
            <View style={styles.attentionHeadingCopy}>
              <Text style={styles.attentionTitle}>{t("home.attentionTitle")}</Text>
              <Text style={styles.attentionBody}>{t("home.attentionBody")}</Text>
            </View>
          </View>
          {data.noSalesWithCurrentStock.length > 0 ? (
            <AttentionRow
              testID="attention-no-sales"
              icon="hanger"
              title={t("home.noSalesWithStock", {
                count: data.noSalesWithCurrentStock.length,
              })}
              detail={t("home.reviewProductPerformance")}
              onPress={onOpenProductsReport}
            />
          ) : null}
          {pendingRefunds > 0 ? (
            <AttentionRow
              testID="attention-pending-refunds"
              icon="cash-refund"
              title={t("home.pendingRefunds", {
                amount: formatMoneyMinor(pendingRefunds, primary.currency),
              })}
              detail={t("home.reviewReturns")}
              onPress={onOpenReturnsReport}
            />
          ) : null}
        </Surface>
      ) : null}
    </View>
  );
}

function TrendBars({ points, currency }: { points: TrendPoint[]; currency: string }) {
  const { t } = useI18n();
  const visible = points.slice(-7);
  const peak = Math.max(...visible.map((point) => Math.max(0, point.netMinor)), 1);

  return (
    <View style={styles.chartBlock} testID="owner-sales-trend">
      <View style={styles.chartHeading}>
        <Text style={styles.chartTitle}>{t("home.salesTrend")}</Text>
        <Text style={styles.chartCurrency}>{currency}</Text>
      </View>
      {visible.length === 0 ? (
        <Text style={styles.chartEmpty}>{t("home.noTrendData")}</Text>
      ) : (
        <View style={styles.chart}>
          {visible.map((point) => {
            const height = 12 + Math.round((Math.max(0, point.netMinor) / peak) * 64);
            return (
              <View key={point.fromInclusive} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height }]} />
                </View>
                <Text numberOfLines={1} style={styles.barLabel}>
                  {shortDate(point.label)}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function AttentionRow({
  testID,
  icon,
  title,
  detail,
  onPress,
}: {
  testID: string;
  icon: AppIconName;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const { isRTL } = useI18n();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      {...webLift}
      style={({ pressed }) => [styles.attentionRow, pressed && styles.pressed]}
    >
      <View style={styles.attentionRowIcon}>
        <AppIcon name={icon} size={18} color={colors.brand} />
      </View>
      <View style={styles.attentionRowCopy}>
        <Text style={styles.attentionRowTitle}>{title}</Text>
        <Text style={styles.attentionRowDetail}>{detail}</Text>
      </View>
      <AppIcon name={directionalIcon("chevron-right", isRTL)} size={21} color={colors.inkSubtle} />
    </Pressable>
  );
}

function shortDate(value: string): string {
  const normalized = value.includes("T") ? value.slice(0, value.indexOf("T")) : value;
  const parts = normalized.split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : value;
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  overviewStack: { gap: spacing.md },
  performanceCard: { padding: spacing.xl, gap: spacing.lg },
  performanceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  performanceCopy: { flex: 1, gap: spacing.xs },
  performanceEyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  performanceValue: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  performanceCaption: { color: colors.inkMuted, ...typography.caption },
  stockMetric: {
    minWidth: 94,
    alignItems: "flex-end",
    gap: 2,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  stockIcon: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  stockValue: { color: colors.ink, fontSize: 20, lineHeight: 25, fontWeight: "800" },
  stockLabel: { color: colors.inkMuted, fontSize: 10, fontWeight: "700" },
  chartBlock: { gap: spacing.sm },
  chartHeading: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  chartTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  chartCurrency: { color: colors.inkSubtle, fontSize: 11, fontWeight: "800" },
  chart: {
    minHeight: 102,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  barColumn: { flex: 1, minWidth: 22, alignItems: "center", gap: spacing.xs },
  barTrack: {
    width: "100%",
    maxWidth: 34,
    height: 76,
    justifyContent: "flex-end",
    overflow: "hidden",
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  bar: { width: "100%", borderRadius: radius.sm, backgroundColor: colors.brand },
  barLabel: { color: colors.inkSubtle, fontSize: 9, fontWeight: "700" },
  chartEmpty: {
    color: colors.inkSubtle,
    ...typography.caption,
    paddingVertical: spacing.xl,
    textAlign: "center",
  },
  performanceFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    paddingTop: spacing.md,
  },
  currencyNote: { flex: 1, color: colors.inkSubtle, fontSize: 11, fontWeight: "600" },
  attentionCard: { gap: spacing.sm },
  attentionHeading: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  attentionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft,
  },
  attentionHeadingCopy: { flex: 1, gap: 2 },
  attentionTitle: { color: colors.ink, ...typography.cardTitle },
  attentionBody: { color: colors.inkMuted, ...typography.caption },
  attentionRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  attentionRowIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  attentionRowCopy: { flex: 1, gap: 2 },
  attentionRowTitle: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  attentionRowDetail: { color: colors.inkMuted, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  emptyOverview: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  emptyIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  emptyCopy: { flex: 1, minWidth: 190, gap: spacing.xs },
  emptyTitle: { color: colors.ink, ...typography.cardTitle },
  pressed: { opacity: 0.78 },
});
