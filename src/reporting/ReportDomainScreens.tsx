import { useCallback, useState } from "react";
import { View } from "react-native";

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
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable title="Sales report" canRead={props.canRead} onBack={props.onBack} />
    );
  }
  return <SalesContent {...props} adapter={props.adapter} />;
}

function SalesContent({ adapter, onBack }: ReportScreenProps & { adapter: ReportingAdapter }) {
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [view, setView] = useState<SalesReportView>("trend");
  const [currency, setCurrency] = useState<string | undefined>();
  const load = useCallback(() => adapter.getSales({ range }, view), [adapter, range, view]);
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Sales" onBack={onBack}>
      <DateRangeControls value={range} onChange={setRange} />
      <SelectField
        label="View"
        selected={view}
        onSelect={(value) => setView(value as SalesReportView)}
        testIDPrefix="sales-view"
        options={[
          { value: "trend", label: "Trend" },
          { value: "channel", label: "Channel" },
          { value: "brand", label: "Brand" },
          { value: "pos_branch", label: "POS Branch" },
          { value: "pos_register", label: "POS Register" },
          { value: "pos_operator", label: "POS Operator" },
        ]}
      />
      <Divider />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.currencies.length === 0}
        emptyMessage="No sales activity exists for this period."
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
      {data.view === "pos_branch" ? <Body>Online sales are not assigned to a Branch.</Body> : null}
      {groups.map((group) => (
        <CurrencySection key={group.currency} currency={group.currency}>
          {data.view === "trend"
            ? group.trend.map((point) => (
                <SurfaceRow key={point.fromInclusive}>
                  <Title>{point.label}</Title>
                  <InfoRow label="Bucket starts" value={point.fromInclusive} />
                  <InfoRow label="Net" value={formatMoneyMinor(point.netMinor, group.currency)} />
                  <InfoRow label="Orders" value={String(point.orders)} />
                </SurfaceRow>
              ))
            : group.rows.map((row) => (
                <SurfaceRow key={row.id}>
                  <Title>{row.label}</Title>
                  <InfoRow label="Gross" value={formatMoneyMinor(row.grossMinor, group.currency)} />
                  <InfoRow
                    label="Discount"
                    value={formatMoneyMinor(row.discountMinor, group.currency)}
                  />
                  <InfoRow label="Net" value={formatMoneyMinor(row.netMinor, group.currency)} />
                  <InfoRow label="Orders" value={String(row.orders)} />
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
      return "Sales trend";
    case "channel":
      return "Sales by channel";
    case "brand":
      return "Sales by Brand";
    case "pos_branch":
      return "POS sales by branch";
    case "pos_register":
      return "POS sales by register";
    case "pos_operator":
      return "POS sales by operator";
  }
}

export function ProductsReportScreen(props: ReportScreenProps) {
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable title="Product sales" canRead={props.canRead} onBack={props.onBack} />
    );
  }
  return <ProductsContent {...props} adapter={props.adapter} />;
}

function ProductsContent({
  adapter,
  onBack,
  saveExport,
}: ReportScreenProps & { adapter: ReportingAdapter }) {
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
    <ReportPageFrame title="Products" onBack={onBack}>
      <DateRangeControls value={range} onChange={(next) => changeAndReset(next, setRange, pager)} />
      <SelectField
        label="Ranking"
        selected={ranking}
        onSelect={(value) => changeAndReset(value as "product" | "variant", setRanking, pager)}
        testIDPrefix="product-ranking"
        options={[
          { value: "product", label: "Product ranking" },
          { value: "variant", label: "Variant ranking" },
        ]}
      />
      <SelectField
        label="Dataset"
        selected={view}
        onSelect={(value) => changeAndReset(value as ProductReportView, setView, pager)}
        testIDPrefix="product-view"
        options={[
          { value: "sales", label: "Sales" },
          { value: "no_sales_with_current_stock", label: "No sales with current stock" },
        ]}
      />
      {view === "sales" ? (
        <ReportExportAction
          adapter={adapter}
          request={{ dataset: "sales-products", range, level: ranking }}
          label={`Export ${ranking === "product" ? "Product" : "Variant"} sales CSV`}
          save={saveExport}
        />
      ) : null}
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.items.items.length === 0}
        emptyMessage="No Product or Variant rows exist for this period."
      >
        {(data) => (
          <View style={{ gap: 12 }}>
            <ReportMetaBlock meta={data.meta} />
            <Title>{data.ranking === "product" ? "Product ranking" : "Variant ranking"}</Title>
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
  return (
    <SurfaceRow>
      {row.currency ? <Eyebrow>{row.currency}</Eyebrow> : null}
      <Title>{row.productName}</Title>
      {row.variantId ? <InfoRow label="Variant" value={row.variantId} /> : null}
      {row.sku ? <InfoRow label="SKU" value={row.sku} /> : null}
      {row.currentOnHand !== undefined ? (
        <>
          <InfoRow label="Current on hand" value={String(row.currentOnHand)} />
          <Body>No sales in period with current stock</Body>
        </>
      ) : null}
      {row.unitsSold !== undefined ? (
        <InfoRow label="Units sold" value={String(row.unitsSold)} />
      ) : null}
      {row.currency && row.grossMinor !== undefined ? (
        <InfoRow label="Gross" value={formatMoneyMinor(row.grossMinor, row.currency)} />
      ) : null}
      {row.currency && row.discountMinor !== undefined ? (
        <InfoRow label="Discount" value={formatMoneyMinor(row.discountMinor, row.currency)} />
      ) : null}
      {row.currency && row.netMinor !== undefined ? (
        <InfoRow label="Net" value={formatMoneyMinor(row.netMinor, row.currency)} />
      ) : null}
    </SurfaceRow>
  );
}

export function InventoryReportScreen(props: ReportScreenProps) {
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title="Inventory report"
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
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [view, setView] = useState<InventoryReportView>("balances");
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getInventory({ range, cursor: pager.cursor }, view),
    [adapter, range, pager.cursor, view],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Inventory" onBack={onBack}>
      <DateRangeControls value={range} onChange={(next) => changeAndReset(next, setRange, pager)} />
      <SelectField
        label="View"
        selected={view}
        onSelect={(value) => changeAndReset(value as InventoryReportView, setView, pager)}
        testIDPrefix="inventory-view"
        options={[
          { value: "balances", label: "Current balances" },
          { value: "movements", label: "Movements" },
          { value: "receipts", label: "Receipts" },
          { value: "transfers", label: "Transfers" },
          { value: "adjustments", label: "Adjustments" },
        ]}
      />
      {view === "movements" ? (
        <ReportExportAction
          adapter={adapter}
          request={{ dataset: "inventory-movements", range }}
          label="Export Inventory movements CSV"
          save={saveExport}
        />
      ) : null}
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.items.items.length === 0}
        emptyMessage="No Inventory rows are available."
      >
        {(data) => <InventoryData data={data} pager={pager} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function InventoryData({ data, pager }: { data: InventoryReport; pager: CursorPager }) {
  return (
    <View style={{ gap: 12 }}>
      {data.meta ? <ReportMetaBlock meta={data.meta} /> : null}
      {data.asOf ? <InfoRow label="Current balances as of" value={data.asOf} /> : null}
      <Body>
        InventoryLocation is the stock-holding identity; it is not a Branch, Warehouse, or Register.
      </Body>
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
  return (
    <SurfaceRow>
      {row.operationType ? <Eyebrow>{row.operationType}</Eyebrow> : null}
      <Title>{row.productName ?? row.supplierName ?? "Inventory operation"}</Title>
      {row.variantId ? <InfoRow label="Variant" value={row.variantId} /> : null}
      {row.sku ? <InfoRow label="SKU" value={row.sku} /> : null}
      {row.inventoryLocationName ? (
        <InfoRow label="InventoryLocation" value={row.inventoryLocationName} />
      ) : null}
      {row.onHand !== undefined ? <InfoRow label="On hand" value={String(row.onHand)} /> : null}
      {row.quantityDelta !== undefined ? (
        <InfoRow label="Quantity change" value={String(row.quantityDelta)} />
      ) : null}
      {row.lineCount !== undefined ? <InfoRow label="Lines" value={String(row.lineCount)} /> : null}
      {row.unitsIn !== undefined ? <InfoRow label="Units in" value={String(row.unitsIn)} /> : null}
      {row.unitsOut !== undefined ? (
        <InfoRow label="Units out" value={String(row.unitsOut)} />
      ) : null}
      {row.actorMembershipId ? <InfoRow label="Actor" value={row.actorMembershipId} /> : null}
      {row.notes ? <InfoRow label="Notes" value={row.notes} /> : null}
      {row.occurredAt ? <InfoRow label="Occurred" value={row.occurredAt} /> : null}
    </SurfaceRow>
  );
}

function inventoryViewTitle(view: InventoryReportView): string {
  if (view === "movements") return "Inventory movements";
  if (view === "receipts") return "Receipts";
  if (view === "transfers") return "Transfers";
  if (view === "adjustments") return "Adjustments";
  return "Current balances";
}

export function ReturnsReportScreen(props: ReportScreenProps) {
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable title="Returns report" canRead={props.canRead} onBack={props.onBack} />
    );
  }
  return <ReturnsContent {...props} adapter={props.adapter} />;
}

function ReturnsContent({
  adapter,
  onBack,
  saveExport,
}: ReportScreenProps & { adapter: ReportingAdapter }) {
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [ranking, setRanking] = useState<"product" | "variant">("product");
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getReturns({ range, cursor: pager.cursor }, ranking),
    [adapter, range, pager.cursor, ranking],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Returns and refunds" onBack={onBack}>
      <DateRangeControls value={range} onChange={(next) => changeAndReset(next, setRange, pager)} />
      <SelectField
        label="Ranking"
        selected={ranking}
        onSelect={(value) => changeAndReset(value as "product" | "variant", setRanking, pager)}
        testIDPrefix="returns-ranking"
        options={[
          { value: "product", label: "Products" },
          { value: "variant", label: "Variants" },
        ]}
      />
      <ReportExportAction
        adapter={adapter}
        request={{ dataset: "returns", range }}
        label="Export Returns/refunds CSV"
        save={saveExport}
      />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.currencies.length === 0 && data.products.items.length === 0}
        emptyMessage="No accepted Returns exist for this period."
      >
        {(data) => <ReturnsData data={data} pager={pager} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function ReturnsData({ data, pager }: { data: ReturnsReport; pager: CursorPager }) {
  return (
    <View style={{ gap: 12 }}>
      <ReportMetaBlock meta={data.meta} />
      {data.currencies.map((group) => (
        <CurrencySection key={group.currency} currency={group.currency}>
          <InfoRow
            label="Accepted returned value"
            value={formatMoneyMinor(group.metrics.acceptedReturnedMinor, group.currency)}
          />
          <InfoRow
            label="Succeeded refunded value"
            value={formatMoneyMinor(group.metrics.succeededRefundedMinor, group.currency)}
          />
          <InfoRow
            label="Pending refunds"
            value={formatMoneyMinor(group.metrics.pendingRefundMinor, group.currency)}
          />
          <InfoRow label="Return count" value={String(group.metrics.returnCount)} />
        </CurrencySection>
      ))}
      <Title>Disposition</Title>
      {data.dispositions.map((row) => (
        <InfoRow key={row.disposition} label={row.disposition} value={String(row.returnedUnits)} />
      ))}
      <Title>Returned {data.ranking === "product" ? "Product" : "Variant"} rankings</Title>
      {data.products.items.map((row) => (
        <SurfaceRow key={`${row.currency}-${row.id}`}>
          <Eyebrow>{row.currency}</Eyebrow>
          <Title>{row.productName}</Title>
          {row.variantId ? <InfoRow label="Variant" value={row.variantId} /> : null}
          {row.sku ? <InfoRow label="SKU" value={row.sku} /> : null}
          <InfoRow label="Returned units" value={String(row.returnedUnits)} />
          <InfoRow
            label="Accepted value"
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
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title="Promotion reporting"
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  }
  return <PromotionsContent {...props} adapter={props.adapter} />;
}

function PromotionsContent({ adapter, onBack }: ReportScreenProps & { adapter: ReportingAdapter }) {
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const load = useCallback(() => adapter.getPromotions({ range }), [adapter, range]);
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Promotions" onBack={onBack}>
      <DateRangeControls value={range} onChange={setRange} />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.promotions.length === 0}
        emptyMessage="No Promotion redemptions exist for this period."
      >
        {(data) => <PromotionsData data={data} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function PromotionsData({ data }: { data: PromotionsReport }) {
  return (
    <View style={{ gap: 12 }}>
      <ReportMetaBlock meta={data.meta} />
      {data.promotions.map((row) => (
        <SurfaceRow key={`${row.currency}-${row.id}`}>
          <Eyebrow>{row.currency}</Eyebrow>
          <Title>{row.promotionName}</Title>
          <InfoRow label="Redemptions" value={String(row.redemptions)} />
          <InfoRow
            label="Discount amount"
            value={formatMoneyMinor(row.discountMinor, row.currency)}
          />
          <InfoRow label="Associated Orders" value={String(row.associatedOrders)} />
          <InfoRow label="Gross sales" value={formatMoneyMinor(row.grossMinor, row.currency)} />
          <InfoRow label="Net sales" value={formatMoneyMinor(row.netMinor, row.currency)} />
          <InfoRow label="Cancelled Orders" value={String(row.cancelledOrders)} />
        </SurfaceRow>
      ))}
    </View>
  );
}

export function SuppliersReportScreen(props: ReportScreenProps) {
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable
        title="Supplier reporting"
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
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getSuppliers({ range, cursor: pager.cursor }),
    [adapter, range, pager.cursor],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Suppliers" onBack={onBack}>
      <DateRangeControls value={range} onChange={(next) => changeAndReset(next, setRange, pager)} />
      <ReportExportAction
        adapter={adapter}
        request={{ dataset: "supplier-receipts", range }}
        label="Export Supplier receipt history CSV"
        save={saveExport}
      />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.suppliers.items.length === 0}
        emptyMessage="No Supplier receipts exist for this period."
      >
        {(data) => <SuppliersData data={data} pager={pager} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function SuppliersData({ data, pager }: { data: SuppliersReport; pager: CursorPager }) {
  return (
    <View style={{ gap: 12 }}>
      <ReportMetaBlock meta={data.meta} />
      {data.suppliers.items.map((row) => (
        <SurfaceRow key={row.id}>
          <Title>{row.supplierName}</Title>
          <InfoRow label="Receipt count" value={String(row.receiptCount)} />
          <InfoRow label="Units received" value={String(row.unitsReceived)} />
          <InfoRow label="Last receipt" value={row.lastReceiptAt ?? "No receipt date"} />
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
