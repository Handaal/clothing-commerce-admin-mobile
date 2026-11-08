import { useCallback, useState } from "react";
import { View } from "react-native";

import { t as translate, useI18n } from "../i18n";
import { formatMoneyMinor } from "../products/display";
import { Body, Divider, Eyebrow, InfoRow, SelectField, SurfaceRow, Title } from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { ReportingAdapter } from "./adapter";
import { DEFAULT_REPORT_RANGE } from "./date-range";
import type { SaveReportExport } from "./export-document";
import type {
  InventoryReport,
  InventoryReportRow,
  InventoryReportView,
  ProductRankingRow,
  ProductReportView,
  PromotionsReport,
  ReportDateRange,
  ReturnsReport,
  SalesReport,
  SalesReportView,
  SuppliersReport,
} from "./model";
import {
  CurrencySelector,
  DateRangeControls,
  PaginationControls,
  ReportAsyncState,
  ReportMetaBlock,
  ReportPageFrame,
  ReportingUnavailable,
} from "./ReportingCommon";
import { ReportExportAction } from "./ReportExportAction";

interface ReportScreenProps {
  adapter: ReportingAdapter | null;
  canRead: boolean;
  onBack: () => void;
  saveExport?: SaveReportExport;
}

export function SalesReportScreen(props: ReportScreenProps) {
  const { t } = useI18n();
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title={t("rpt.salesReportTitle")}
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  }
  return <SalesContent {...props} adapter={props.adapter} />;
}

function SalesContent({ adapter, onBack }: ReportScreenProps & { adapter: ReportingAdapter }) {
  const { t } = useI18n();
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [view, setView] = useState<SalesReportView>("trend");
  const [currency, setCurrency] = useState<string | undefined>();
  const load = useCallback(() => adapter.getSales({ range }, view), [adapter, range, view]);
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title={t("rpt.salesTitle")} onBack={onBack}>
      <DateRangeControls value={range} onChange={setRange} />
      <SelectField
        label={t("rpt.view")}
        selected={view}
        onSelect={(value) => setView(value as SalesReportView)}
        testIDPrefix="sales-view"
        options={[
          { value: "trend", label: t("rpt.viewTrend") },
          { value: "channel", label: t("rpt.viewChannel") },
          { value: "brand", label: t("rpt.viewBrand") },
          { value: "pos_branch", label: t("rpt.viewPosBranch") },
          { value: "pos_register", label: t("rpt.viewPosRegister") },
          { value: "pos_operator", label: t("rpt.viewPosOperator") },
        ]}
      />
      <Divider />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.currencies.length === 0}
        emptyMessage={t("rpt.emptySales")}
      >
        {(data) => (
          <SalesData data={data} selectedCurrency={currency} onCurrencyChange={setCurrency} />
        )}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function SalesData({
  data,
  selectedCurrency,
  onCurrencyChange,
}: {
  data: SalesReport;
  selectedCurrency?: string;
  onCurrencyChange: (currency: string | undefined) => void;
}) {
  const { t } = useI18n();
  const groups = selectedCurrency
    ? data.currencies.filter((group) => group.currency === selectedCurrency)
    : data.currencies;
  return (
    <View style={{ gap: 12 }}>
      <ReportMetaBlock meta={data.meta} />
      <CurrencySelector
        currencies={data.currencies.map((group) => group.currency)}
        selected={selectedCurrency}
        onChange={onCurrencyChange}
      />
      <Title>{salesViewTitle(data.view)}</Title>
      {data.view === "pos_branch" ? <Body>{t("rpt.onlineNotBranch")}</Body> : null}
      {groups.map((group) => (
        <CurrencySection key={group.currency} currency={group.currency}>
          {data.view === "trend"
            ? group.trend.map((point) => (
                <SurfaceRow key={point.fromInclusive}>
                  <Title>{point.label}</Title>
                  <InfoRow label={t("rpt.bucketStarts")} value={point.fromInclusive} />
                  <InfoRow
                    label={t("rpt.net")}
                    value={formatMoneyMinor(point.netMinor, group.currency)}
                  />
                  <InfoRow label={t("rpt.orders")} value={String(point.orders)} />
                </SurfaceRow>
              ))
            : group.rows.map((row) => (
                <SurfaceRow key={row.id}>
                  <Title>{row.label}</Title>
                  <InfoRow
                    label={t("rpt.gross")}
                    value={formatMoneyMinor(row.grossMinor, group.currency)}
                  />
                  <InfoRow
                    label={t("rpt.discount")}
                    value={formatMoneyMinor(row.discountMinor, group.currency)}
                  />
                  <InfoRow
                    label={t("rpt.net")}
                    value={formatMoneyMinor(row.netMinor, group.currency)}
                  />
                  <InfoRow label={t("rpt.orders")} value={String(row.orders)} />
                </SurfaceRow>
              ))}
        </CurrencySection>
      ))}
    </View>
  );
}

function salesViewTitle(view: SalesReportView): string {
  switch (view) {
    case "trend":
      return translate("rpt.salesTrend");
    case "channel":
      return translate("rpt.salesByChannel");
    case "brand":
      return translate("rpt.salesByBrand");
    case "pos_branch":
      return translate("rpt.posSalesByBranch");
    case "pos_register":
      return translate("rpt.posSalesByRegister");
    case "pos_operator":
      return translate("rpt.posSalesByOperator");
  }
}

export function ProductsReportScreen(props: ReportScreenProps) {
  const { t } = useI18n();
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title={t("rpt.productSalesTitle")}
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  }
  return <ProductsContent {...props} adapter={props.adapter} />;
}

function ProductsContent({
  adapter,
  onBack,
  saveExport,
}: ReportScreenProps & { adapter: ReportingAdapter }) {
  const { t } = useI18n();
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [ranking, setRanking] = useState<"product" | "variant">("product");
  const [view, setView] = useState<ProductReportView>("sales");
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getProductSales({ range, cursor: pager.cursor }, ranking, view),
    [adapter, range, pager.cursor, ranking, view],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title={t("rpt.productsTitle")} onBack={onBack}>
      <DateRangeControls value={range} onChange={(next) => changeAndReset(next, setRange, pager)} />
      <SelectField
        label={t("rpt.ranking")}
        selected={ranking}
        onSelect={(value) => changeAndReset(value as "product" | "variant", setRanking, pager)}
        testIDPrefix="product-ranking"
        options={[
          { value: "product", label: t("rpt.rankingProduct") },
          { value: "variant", label: t("rpt.rankingVariant") },
        ]}
      />
      <SelectField
        label={t("rpt.dataset")}
        selected={view}
        onSelect={(value) => changeAndReset(value as ProductReportView, setView, pager)}
        testIDPrefix="product-view"
        options={[
          { value: "sales", label: t("rpt.datasetSales") },
          { value: "no_sales_with_current_stock", label: t("rpt.datasetNoSales") },
        ]}
      />
      {view === "sales" ? (
        <ReportExportAction
          adapter={adapter}
          request={{ dataset: "sales-products", range, level: ranking }}
          label={t("rpt.exportProductSales", {
            level: ranking === "product" ? t("rpt.levelProduct") : t("rpt.levelVariant"),
          })}
          save={saveExport}
        />
      ) : null}
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.items.items.length === 0}
        emptyMessage={t("rpt.emptyProducts")}
      >
        {(data) => (
          <View style={{ gap: 12 }}>
            <ReportMetaBlock meta={data.meta} />
            <Title>
              {data.ranking === "product" ? t("rpt.rankingProduct") : t("rpt.rankingVariant")}
            </Title>
            {data.items.items.map((row) => (
              <ProductRanking key={`${row.currency}-${row.id}`} row={row} />
            ))}
            <PaginationControls
              canPrevious={pager.canPrevious}
              canNext={data.items.nextCursor !== null}
              onPrevious={pager.previous}
              onNext={() => pager.next(data.items.nextCursor)}
            />
          </View>
        )}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function ProductRanking({ row }: { row: ProductRankingRow }) {
  const { t } = useI18n();
  return (
    <SurfaceRow>
      {row.currency ? <Eyebrow>{row.currency}</Eyebrow> : null}
      <Title>{row.productName}</Title>
      {row.variantId ? <InfoRow label={t("rpt.variant")} value={row.variantId} /> : null}
      {row.sku ? <InfoRow label={t("rpt.sku")} value={row.sku} /> : null}
      {row.currentOnHand !== undefined ? (
        <>
          <InfoRow label={t("rpt.currentOnHand")} value={String(row.currentOnHand)} />
          <Body>{t("rpt.noSalesWithStock")}</Body>
        </>
      ) : null}
      {row.unitsSold !== undefined ? (
        <InfoRow label={t("rpt.unitsSold")} value={String(row.unitsSold)} />
      ) : null}
      {row.currency && row.grossMinor !== undefined ? (
        <InfoRow label={t("rpt.gross")} value={formatMoneyMinor(row.grossMinor, row.currency)} />
      ) : null}
      {row.currency && row.discountMinor !== undefined ? (
        <InfoRow
          label={t("rpt.discount")}
          value={formatMoneyMinor(row.discountMinor, row.currency)}
        />
      ) : null}
      {row.currency && row.netMinor !== undefined ? (
        <InfoRow label={t("rpt.net")} value={formatMoneyMinor(row.netMinor, row.currency)} />
      ) : null}
    </SurfaceRow>
  );
}

export function InventoryReportScreen(props: ReportScreenProps) {
  const { t } = useI18n();
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title={t("rpt.inventoryReportTitle")}
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  }
  return <InventoryContent {...props} adapter={props.adapter} />;
}

function InventoryContent({
  adapter,
  onBack,
  saveExport,
}: ReportScreenProps & { adapter: ReportingAdapter }) {
  const { t } = useI18n();
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [view, setView] = useState<InventoryReportView>("balances");
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getInventory({ range, cursor: pager.cursor }, view),
    [adapter, range, pager.cursor, view],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title={t("rpt.inventoryTitle")} onBack={onBack}>
      <DateRangeControls value={range} onChange={(next) => changeAndReset(next, setRange, pager)} />
      <SelectField
        label={t("rpt.view")}
        selected={view}
        onSelect={(value) => changeAndReset(value as InventoryReportView, setView, pager)}
        testIDPrefix="inventory-view"
        options={[
          { value: "balances", label: t("rpt.invBalances") },
          { value: "movements", label: t("rpt.invMovements") },
          { value: "receipts", label: t("rpt.invReceipts") },
          { value: "transfers", label: t("rpt.invTransfers") },
          { value: "adjustments", label: t("rpt.invAdjustments") },
        ]}
      />
      {view === "movements" ? (
        <ReportExportAction
          adapter={adapter}
          request={{ dataset: "inventory-movements", range }}
          label={t("rpt.exportInventoryMovements")}
          save={saveExport}
        />
      ) : null}
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.items.items.length === 0}
        emptyMessage={t("rpt.emptyInventory")}
      >
        {(data) => <InventoryData data={data} pager={pager} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function InventoryData({ data, pager }: { data: InventoryReport; pager: CursorPager }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 12 }}>
      {data.meta ? <ReportMetaBlock meta={data.meta} /> : null}
      {data.asOf ? <InfoRow label={t("rpt.balancesAsOf")} value={data.asOf} /> : null}
      <Body>{t("rpt.invLocationNote")}</Body>
      <Title>{inventoryViewTitle(data.view)}</Title>
      {data.items.items.map((row) => (
        <InventoryRow key={row.id} row={row} />
      ))}
      <PaginationControls
        canPrevious={pager.canPrevious}
        canNext={data.items.nextCursor !== null}
        onPrevious={pager.previous}
        onNext={() => pager.next(data.items.nextCursor)}
      />
    </View>
  );
}

function InventoryRow({ row }: { row: InventoryReportRow }) {
  const { t } = useI18n();
  return (
    <SurfaceRow>
      {row.operationType ? <Eyebrow>{row.operationType}</Eyebrow> : null}
      <Title>{row.productName ?? row.supplierName ?? t("rpt.inventoryOperation")}</Title>
      {row.variantId ? <InfoRow label={t("rpt.variant")} value={row.variantId} /> : null}
      {row.sku ? <InfoRow label={t("rpt.sku")} value={row.sku} /> : null}
      {row.inventoryLocationName ? (
        <InfoRow label={t("rpt.inventoryLocation")} value={row.inventoryLocationName} />
      ) : null}
      {row.onHand !== undefined ? (
        <InfoRow label={t("rpt.onHand")} value={String(row.onHand)} />
      ) : null}
      {row.quantityDelta !== undefined ? (
        <InfoRow label={t("rpt.quantityChange")} value={String(row.quantityDelta)} />
      ) : null}
      {row.lineCount !== undefined ? (
        <InfoRow label={t("rpt.lines")} value={String(row.lineCount)} />
      ) : null}
      {row.unitsIn !== undefined ? (
        <InfoRow label={t("rpt.unitsIn")} value={String(row.unitsIn)} />
      ) : null}
      {row.unitsOut !== undefined ? (
        <InfoRow label={t("rpt.unitsOut")} value={String(row.unitsOut)} />
      ) : null}
      {row.actorMembershipId ? (
        <InfoRow label={t("rpt.actor")} value={row.actorMembershipId} />
      ) : null}
      {row.notes ? <InfoRow label={t("rpt.notes")} value={row.notes} /> : null}
      {row.occurredAt ? <InfoRow label={t("rpt.occurred")} value={row.occurredAt} /> : null}
    </SurfaceRow>
  );
}

function inventoryViewTitle(view: InventoryReportView): string {
  if (view === "movements") return translate("rpt.invMovementsTitle");
  if (view === "receipts") return translate("rpt.invReceipts");
  if (view === "transfers") return translate("rpt.invTransfers");
  if (view === "adjustments") return translate("rpt.invAdjustments");
  return translate("rpt.invBalances");
}

export function ReturnsReportScreen(props: ReportScreenProps) {
  const { t } = useI18n();
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title={t("rpt.returnsReportTitle")}
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  }
  return <ReturnsContent {...props} adapter={props.adapter} />;
}

function ReturnsContent({
  adapter,
  onBack,
  saveExport,
}: ReportScreenProps & { adapter: ReportingAdapter }) {
  const { t } = useI18n();
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [ranking, setRanking] = useState<"product" | "variant">("product");
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getReturns({ range, cursor: pager.cursor }, ranking),
    [adapter, range, pager.cursor, ranking],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title={t("rpt.returnsTitle")} onBack={onBack}>
      <DateRangeControls value={range} onChange={(next) => changeAndReset(next, setRange, pager)} />
      <SelectField
        label={t("rpt.ranking")}
        selected={ranking}
        onSelect={(value) => changeAndReset(value as "product" | "variant", setRanking, pager)}
        testIDPrefix="returns-ranking"
        options={[
          { value: "product", label: t("rpt.returnsProducts") },
          { value: "variant", label: t("rpt.returnsVariants") },
        ]}
      />
      <ReportExportAction
        adapter={adapter}
        request={{ dataset: "returns", range }}
        label={t("rpt.exportReturns")}
        save={saveExport}
      />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.currencies.length === 0 && data.products.items.length === 0}
        emptyMessage={t("rpt.emptyReturns")}
      >
        {(data) => <ReturnsData data={data} pager={pager} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function ReturnsData({ data, pager }: { data: ReturnsReport; pager: CursorPager }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 12 }}>
      <ReportMetaBlock meta={data.meta} />
      {data.currencies.map((group) => (
        <CurrencySection key={group.currency} currency={group.currency}>
          <InfoRow
            label={t("rpt.acceptedReturned")}
            value={formatMoneyMinor(group.metrics.acceptedReturnedMinor, group.currency)}
          />
          <InfoRow
            label={t("rpt.succeededRefunded")}
            value={formatMoneyMinor(group.metrics.succeededRefundedMinor, group.currency)}
          />
          <InfoRow
            label={t("rpt.pendingRefunds")}
            value={formatMoneyMinor(group.metrics.pendingRefundMinor, group.currency)}
          />
          <InfoRow label={t("rpt.returnCount")} value={String(group.metrics.returnCount)} />
        </CurrencySection>
      ))}
      <Title>{t("rpt.disposition")}</Title>
      {data.dispositions.map((row) => (
        <InfoRow key={row.disposition} label={row.disposition} value={String(row.returnedUnits)} />
      ))}
      <Title>
        {t("rpt.returnedRankings", {
          level: data.ranking === "product" ? t("rpt.levelProduct") : t("rpt.levelVariant"),
        })}
      </Title>
      {data.products.items.map((row) => (
        <SurfaceRow key={`${row.currency}-${row.id}`}>
          <Eyebrow>{row.currency}</Eyebrow>
          <Title>{row.productName}</Title>
          {row.variantId ? <InfoRow label={t("rpt.variant")} value={row.variantId} /> : null}
          {row.sku ? <InfoRow label={t("rpt.sku")} value={row.sku} /> : null}
          <InfoRow label={t("rpt.returnedUnits")} value={String(row.returnedUnits)} />
          <InfoRow
            label={t("rpt.acceptedValue")}
            value={formatMoneyMinor(row.acceptedReturnedMinor, row.currency)}
          />
        </SurfaceRow>
      ))}
      <PaginationControls
        canPrevious={pager.canPrevious}
        canNext={data.products.nextCursor !== null}
        onPrevious={pager.previous}
        onNext={() => pager.next(data.products.nextCursor)}
      />
    </View>
  );
}

export function PromotionsReportScreen(props: ReportScreenProps) {
  const { t } = useI18n();
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title={t("rpt.promotionReportingTitle")}
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  }
  return <PromotionsContent {...props} adapter={props.adapter} />;
}

function PromotionsContent({ adapter, onBack }: ReportScreenProps & { adapter: ReportingAdapter }) {
  const { t } = useI18n();
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const load = useCallback(() => adapter.getPromotions({ range }), [adapter, range]);
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title={t("rpt.promotionsTitle")} onBack={onBack}>
      <DateRangeControls value={range} onChange={setRange} />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.promotions.length === 0}
        emptyMessage={t("rpt.emptyPromotions")}
      >
        {(data) => <PromotionsData data={data} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function PromotionsData({ data }: { data: PromotionsReport }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 12 }}>
      <ReportMetaBlock meta={data.meta} />
      {data.promotions.map((row) => (
        <SurfaceRow key={`${row.currency}-${row.id}`}>
          <Eyebrow>{row.currency}</Eyebrow>
          <Title>{row.promotionName}</Title>
          <InfoRow label={t("rpt.redemptions")} value={String(row.redemptions)} />
          <InfoRow
            label={t("rpt.discountAmount")}
            value={formatMoneyMinor(row.discountMinor, row.currency)}
          />
          <InfoRow label={t("rpt.associatedOrders")} value={String(row.associatedOrders)} />
          <InfoRow
            label={t("rpt.grossSales")}
            value={formatMoneyMinor(row.grossMinor, row.currency)}
          />
          <InfoRow label={t("rpt.netSales")} value={formatMoneyMinor(row.netMinor, row.currency)} />
          <InfoRow label={t("rpt.cancelledOrders")} value={String(row.cancelledOrders)} />
        </SurfaceRow>
      ))}
    </View>
  );
}

export function SuppliersReportScreen(props: ReportScreenProps) {
  const { t } = useI18n();
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title={t("rpt.supplierReportingTitle")}
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  }
  return <SuppliersContent {...props} adapter={props.adapter} />;
}

function SuppliersContent({
  adapter,
  onBack,
  saveExport,
}: ReportScreenProps & { adapter: ReportingAdapter }) {
  const { t } = useI18n();
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getSuppliers({ range, cursor: pager.cursor }),
    [adapter, range, pager.cursor],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title={t("rpt.suppliersTitle")} onBack={onBack}>
      <DateRangeControls value={range} onChange={(next) => changeAndReset(next, setRange, pager)} />
      <ReportExportAction
        adapter={adapter}
        request={{ dataset: "supplier-receipts", range }}
        label={t("rpt.exportSupplierReceipts")}
        save={saveExport}
      />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.suppliers.items.length === 0}
        emptyMessage={t("rpt.emptySuppliers")}
      >
        {(data) => <SuppliersData data={data} pager={pager} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function SuppliersData({ data, pager }: { data: SuppliersReport; pager: CursorPager }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 12 }}>
      <ReportMetaBlock meta={data.meta} />
      {data.suppliers.items.map((row) => (
        <SurfaceRow key={row.id}>
          <Title>{row.supplierName}</Title>
          <InfoRow label={t("rpt.receiptCount")} value={String(row.receiptCount)} />
          <InfoRow label={t("rpt.unitsReceived")} value={String(row.unitsReceived)} />
          <InfoRow
            label={t("rpt.lastReceipt")}
            value={row.lastReceiptAt ?? t("rpt.noReceiptDate")}
          />
        </SurfaceRow>
      ))}
      <PaginationControls
        canPrevious={pager.canPrevious}
        canNext={data.suppliers.nextCursor !== null}
        onPrevious={pager.previous}
        onNext={() => pager.next(data.suppliers.nextCursor)}
      />
    </View>
  );
}

function CurrencySection({ currency, children }: { currency: string; children: React.ReactNode }) {
  return (
    <View testID={`currency-group-${currency}`} style={{ gap: 8 }}>
      <Title>{currency}</Title>
      {children}
    </View>
  );
}

interface CursorPager {
  cursor: string | undefined;
  canPrevious: boolean;
  next: (cursor: string | null) => void;
  previous: () => void;
  reset: () => void;
}

function useCursorPager(): CursorPager {
  const [history, setHistory] = useState<(string | undefined)[]>([undefined]);
  return {
    cursor: history.at(-1),
    canPrevious: history.length > 1,
    next: (cursor) => {
      if (cursor !== null) setHistory((current) => [...current, cursor]);
    },
    previous: () => setHistory((current) => (current.length > 1 ? current.slice(0, -1) : current)),
    reset: () => setHistory([undefined]),
  };
}

function changeAndReset<T>(value: T, change: (value: T) => void, pager: CursorPager) {
  pager.reset();
  change(value);
}
