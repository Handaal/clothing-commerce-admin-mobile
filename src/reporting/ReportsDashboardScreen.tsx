import { useCallback, useState } from "react";
import { View } from "react-native";

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
  if (!props.canRead || !props.adapter) {
    return <ReportingUnavailable title="Reports" canRead={props.canRead} onBack={props.onBack} />;
  }
  return <DashboardContent {...props} adapter={props.adapter} />;
}

function DashboardContent({
  adapter,
  onOpen,
  onBack,
}: ReportsDashboardScreenProps & { adapter: ReportingAdapter }) {
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [currency, setCurrency] = useState<string | undefined>();
  const load = useCallback(() => adapter.getDashboard({ range }), [adapter, range]);
  const { state, reload } = useAsync(load);

  return (
    <ReportPageFrame title="Management dashboard" onBack={onBack}>
      <DateRangeControls value={range} onChange={setRange} />
      <Divider />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.currencies.length === 0 && data.inventoryExceptions.length === 0}
        emptyMessage="No reporting activity exists for this period."
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
      <Title>Top Products</Title>
      {products.length === 0 ? <Body>No Product sales in this period.</Body> : null}
      {products.map((product) => (
        <SurfaceRow key={`${product.currency}-${product.id}`}>
          <Eyebrow>{product.currency}</Eyebrow>
          <Title>{product.productName}</Title>
          <InfoRow label="Units sold" value={String(product.unitsSold)} />
          <InfoRow label="Net" value={formatMoneyMinor(product.netMinor, product.currency)} />
        </SurfaceRow>
      ))}

      <Divider />
      <Title>Current inventory exceptions</Title>
      {data.inventoryExceptions.length === 0 ? <Body>No current inventory exceptions.</Body> : null}
      {data.inventoryExceptions.map((item) => (
        <SurfaceRow key={item.id}>
          <Title>{item.productName}</Title>
          <Body>{item.variantName}</Body>
          <InfoRow label="InventoryLocation" value={item.inventoryLocationName} />
          <InfoRow label="On hand" value={String(item.onHand)} />
          <Body>{item.label}</Body>
        </SurfaceRow>
      ))}

      <Divider />
      <Eyebrow>Detailed reports</Eyebrow>
      {(["sales", "products", "inventory", "returns", "promotions", "suppliers"] as const).map(
        (report) => (
          <PrimaryButton
            key={report}
            testID={`open-report-${report}`}
            label={`Open ${report} report`}
            onPress={() => onOpen(report)}
          />
        ),
      )}
    </View>
  );
}

function CurrencyDashboard({ group }: { group: CurrencySalesGroup }) {
  return (
    <View testID={`currency-group-${group.currency}`} style={{ gap: 10 }}>
      <Title>{group.currency}</Title>
      <View style={{ gap: 8 }}>
        <InfoRow label="Gross" value={formatMoneyMinor(group.sales.grossMinor, group.currency)} />
        <InfoRow
          label="Discounts"
          value={formatMoneyMinor(group.sales.discountMinor, group.currency)}
        />
        <InfoRow label="Net" value={formatMoneyMinor(group.sales.netMinor, group.currency)} />
        <InfoRow label="Orders" value={String(group.sales.orders)} />
        <InfoRow
          label="AOV"
          value={formatMoneyMinor(group.sales.averageOrderValueMinor, group.currency)}
        />
      </View>

      <Divider />
      <Eyebrow>Returns and refunds â€” separate from sales</Eyebrow>
      <InfoRow
        label="Accepted returned value"
        value={formatMoneyMinor(group.returns.acceptedReturnedMinor, group.currency)}
      />
      <InfoRow
        label="Succeeded refunded value"
        value={formatMoneyMinor(group.returns.succeededRefundedMinor, group.currency)}
      />
      <InfoRow
        label="Pending refunds"
        value={formatMoneyMinor(group.returns.pendingRefundMinor, group.currency)}
      />
      <InfoRow label="Return count" value={String(group.returns.returnCount)} />

      <Divider />
      <Title>Sales trend</Title>
      <Body>Accessible bucket table; boundaries come from the reporting service.</Body>
      {group.trend.map((point) => (
        <SurfaceRow key={`${group.currency}-${point.fromInclusive}`}>
          <Title>{point.label}</Title>
          <InfoRow label="Bucket starts" value={point.fromInclusive} />
          <InfoRow label="Bucket ends" value={point.toExclusive} />
          <InfoRow label="Net" value={formatMoneyMinor(point.netMinor, group.currency)} />
          <InfoRow label="Orders" value={String(point.orders)} />
        </SurfaceRow>
      ))}

      <Breakdown title="POS vs Online" rows={group.channels} currency={group.currency} />
      <Breakdown title="Brand breakdown" rows={group.brands} currency={group.currency} />
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
  return (
    <View style={{ gap: 8 }}>
      <Title>{title}</Title>
      {rows.map((row) => (
        <SurfaceRow key={row.id}>
          <Title>{row.label}</Title>
          <InfoRow label="Net" value={formatMoneyMinor(row.netMinor, currency)} />
          <InfoRow label="Orders" value={String(row.orders)} />
        </SurfaceRow>
      ))}
    </View>
  );
}
