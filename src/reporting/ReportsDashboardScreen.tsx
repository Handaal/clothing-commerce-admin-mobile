import { useCallback, useState } from "react";
import { View } from "react-native";

import { useI18n, type MessageKey } from "../i18n";
import { formatMoneyMinor } from "../products/display";
import {
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  PrimaryButton,
  SurfaceRow,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { ReportingAdapter } from "./adapter";
import { DEFAULT_REPORT_RANGE } from "./date-range";
import type { CurrencySalesGroup, DashboardReport, ReportDateRange } from "./model";
import {
  CurrencySelector,
  DateRangeControls,
  ReportAsyncState,
  ReportMetaBlock,
  ReportPageFrame,
  ReportingUnavailable,
} from "./ReportingCommon";

export interface ReportsDashboardScreenProps {
  adapter: ReportingAdapter | null;
  canRead: boolean;
  onOpen: (
    report: "sales" | "products" | "inventory" | "returns" | "promotions" | "suppliers",
  ) => void;
  onBack: () => void;
}

export function ReportsDashboardScreen(props: ReportsDashboardScreenProps) {
  const { t } = useI18n();
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title={t("reportDash.reportsTitle")}
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  }
  return <DashboardContent {...props} adapter={props.adapter} />;
}

function DashboardContent({
  adapter,
  onOpen,
  onBack,
}: ReportsDashboardScreenProps & { adapter: ReportingAdapter }) {
  const { t } = useI18n();
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [currency, setCurrency] = useState<string | undefined>();
  const load = useCallback(() => adapter.getDashboard({ range }), [adapter, range]);
  const { state, reload } = useAsync(load);

  return (
    <ReportPageFrame title={t("reportDash.title")} onBack={onBack}>
      <DateRangeControls value={range} onChange={setRange} />
      <Divider />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) =>
          data.currencies.length === 0 &&
          data.topProducts.length === 0 &&
          data.noSalesWithCurrentStock.length === 0
        }
        emptyMessage={t("reportDash.empty")}
      >
        {(data) => (
          <DashboardData
            data={data}
            selectedCurrency={currency}
            onCurrencyChange={setCurrency}
            onOpen={onOpen}
          />
        )}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function DashboardData({
  data,
  selectedCurrency,
  onCurrencyChange,
  onOpen,
}: {
  data: DashboardReport;
  selectedCurrency?: string;
  onCurrencyChange: (currency: string | undefined) => void;
  onOpen: ReportsDashboardScreenProps["onOpen"];
}) {
  const { t } = useI18n();
  const reportNameKey: Record<Parameters<ReportsDashboardScreenProps["onOpen"]>[0], MessageKey> = {
    sales: "reportName.sales",
    products: "reportName.products",
    inventory: "reportName.inventory",
    returns: "reportName.returns",
    promotions: "reportName.promotions",
    suppliers: "reportName.suppliers",
  };
  const groups = selectedCurrency
    ? data.currencies.filter((group) => group.currency === selectedCurrency)
    : data.currencies;
  const products = selectedCurrency
    ? data.topProducts.filter((product) => product.currency === selectedCurrency)
    : data.topProducts;
  return (
    <View style={{ gap: 14 }}>
      <ReportMetaBlock meta={data.meta} />
      <CurrencySelector
        currencies={data.currencies.map((group) => group.currency)}
        selected={selectedCurrency}
        onChange={onCurrencyChange}
      />
      {groups.map((group) => (
        <CurrencyDashboard key={group.currency} group={group} />
      ))}

      <Divider />
      <Title>{t("reportDash.topProducts")}</Title>
      {products.length === 0 ? <Body>{t("reportDash.noProductSales")}</Body> : null}
      {products.map((product) => (
        <SurfaceRow key={`${product.currency}-${product.id}`}>
          {product.currency ? <Eyebrow>{product.currency}</Eyebrow> : null}
          <Title>{product.productName}</Title>
          <InfoRow label={t("reportDash.unitsSold")} value={String(product.unitsSold ?? 0)} />
          {product.currency !== undefined && product.netMinor !== undefined ? (
            <InfoRow
              label={t("reportDash.net")}
              value={formatMoneyMinor(product.netMinor, product.currency)}
            />
          ) : null}
        </SurfaceRow>
      ))}

      <Divider />
      <Title>{t("reportDash.stockSummary")}</Title>
      <InfoRow label={t("reportDash.onHand")} value={String(data.stock.totalOnHand)} />
      <InfoRow label={t("reportDash.variants")} value={String(data.stock.variantCount)} />
      <InfoRow
        label={t("reportDash.inventoryLocations")}
        value={String(data.stock.locationCount)}
      />
      <InfoRow label={t("reportDash.inventoryAsOf")} value={data.stock.asOf} />

      <Divider />
      <Title>{t("reportDash.noSalesWithStock")}</Title>
      {data.noSalesWithCurrentStock.length === 0 ? (
        <Body>{t("reportDash.noMatchingProducts")}</Body>
      ) : null}
      {data.noSalesWithCurrentStock.map((item) => (
        <SurfaceRow key={item.id}>
          <Title>{item.productName}</Title>
          {item.sku ? <InfoRow label={t("reportDash.variantSku")} value={item.sku} /> : null}
          <InfoRow label={t("reportDash.currentOnHand")} value={String(item.currentOnHand ?? 0)} />
        </SurfaceRow>
      ))}

      <Divider />
      <Eyebrow>{t("reportDash.detailedReports")}</Eyebrow>
      {(["sales", "products", "inventory", "returns", "promotions", "suppliers"] as const).map(
        (report) => (
          <PrimaryButton
            key={report}
            testID={`open-report-${report}`}
            label={t("reportDash.openReport", { report: t(reportNameKey[report]) })}
            onPress={() => onOpen(report)}
          />
        ),
      )}
    </View>
  );
}

function CurrencyDashboard({ group }: { group: CurrencySalesGroup }) {
  const { t } = useI18n();
  return (
    <View testID={`currency-group-${group.currency}`} style={{ gap: 10 }}>
      <Title>{group.currency}</Title>
      <View style={{ gap: 8 }}>
        <InfoRow
          label={t("reportDash.gross")}
          value={formatMoneyMinor(group.sales.grossMinor, group.currency)}
        />
        <InfoRow
          label={t("reportDash.discounts")}
          value={formatMoneyMinor(group.sales.discountMinor, group.currency)}
        />
        <InfoRow
          label={t("reportDash.net")}
          value={formatMoneyMinor(group.sales.netMinor, group.currency)}
        />
        <InfoRow label={t("reportDash.orders")} value={String(group.sales.orders)} />
        <InfoRow
          label={t("reportDash.aov")}
          value={
            group.sales.averageOrderValueMinor === null
              ? t("reportDash.notAvailable")
              : formatMoneyMinor(group.sales.averageOrderValueMinor, group.currency)
          }
        />
      </View>

      <Divider />
      <Eyebrow>{t("reportDash.returnsSeparate")}</Eyebrow>
      <InfoRow
        label={t("reportDash.acceptedReturned")}
        value={formatMoneyMinor(group.returns.acceptedReturnedMinor, group.currency)}
      />
      <InfoRow
        label={t("reportDash.succeededRefunded")}
        value={formatMoneyMinor(group.returns.succeededRefundedMinor, group.currency)}
      />
      <InfoRow
        label={t("reportDash.pendingRefunds")}
        value={formatMoneyMinor(group.returns.pendingRefundMinor, group.currency)}
      />
      <InfoRow label={t("reportDash.returnCount")} value={String(group.returns.returnCount)} />

      <Divider />
      <Title>{t("reportDash.salesTrend")}</Title>
      <Body>{t("reportDash.trendNote")}</Body>
      {group.trend.map((point) => (
        <SurfaceRow key={`${group.currency}-${point.fromInclusive}`}>
          <Title>{point.label}</Title>
          <InfoRow label={t("reportDash.bucketStarts")} value={point.fromInclusive} />
          <InfoRow
            label={t("reportDash.net")}
            value={formatMoneyMinor(point.netMinor, group.currency)}
          />
          <InfoRow label={t("reportDash.orders")} value={String(point.orders)} />
        </SurfaceRow>
      ))}

      <Breakdown
        title={t("reportDash.posVsOnline")}
        rows={group.channels}
        currency={group.currency}
      />
      <Breakdown
        title={t("reportDash.brandBreakdown")}
        rows={group.brands}
        currency={group.currency}
      />
    </View>
  );
}

function Breakdown({
  title,
  rows,
  currency,
}: {
  title: string;
  rows: CurrencySalesGroup["channels"];
  currency: string;
}) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 8 }}>
      <Title>{title}</Title>
      {rows.map((row) => (
        <SurfaceRow key={row.id}>
          <Title>{row.label}</Title>
          <InfoRow label={t("reportDash.net")} value={formatMoneyMinor(row.netMinor, currency)} />
          <InfoRow label={t("reportDash.orders")} value={String(row.orders)} />
        </SurfaceRow>
      ))}
    </View>
  );
}
