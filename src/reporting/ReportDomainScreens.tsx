import { useCallback, useState } from "react";
import { View } from "react-native";

import { formatMoneyMinor } from "../products/display";
import { Body, Divider, Eyebrow, InfoRow, SelectField, SurfaceRow, Title } from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { ReportingAdapter } from "./adapter";
import { DEFAULT_REPORT_RANGE } from "./date-range";
import type {
  CurrencySalesGroup,
  InventoryMovementKind,
  InventoryReport,
  ProductRankingRow,
  PromotionsReport,
  ReportDateRange,
  ReturnsReport,
  SalesReport,
  SuppliersReport,
} from "./model";
import {
  CurrencySelector,
  DateRangeControls,
  ExportReserved,
  PaginationControls,
  ReportAsyncState,
  ReportMetaBlock,
  ReportPageFrame,
  ReportingUnavailable,
} from "./ReportingCommon";

interface ReportScreenProps {
  adapter: ReportingAdapter | null;
  canRead: boolean;
  onBack: () => void;
}

type SalesView = "trend" | "channel" | "brand" | "pos-branch" | "pos-register" | "pos-operator";

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
  const [view, setView] = useState<SalesView>("trend");
  const [currency, setCurrency] = useState<string | undefined>();
  const load = useCallback(() => adapter.getSales({ range }), [adapter, range]);
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Sales" onBack={onBack}>
      <DateRangeControls value={range} onChange={setRange} />
      <SelectField
        label="View"
        selected={view}
        onSelect={(value) => setView(value as SalesView)}
        testIDPrefix="sales-view"
        options={[
          { value: "trend", label: "Trend" },
          { value: "channel", label: "Channel" },
          { value: "brand", label: "Brand" },
          { value: "pos-branch", label: "POS Branch" },
          { value: "pos-register", label: "POS Register" },
          { value: "pos-operator", label: "POS Operator" },
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
          <SalesData
            data={data}
            view={view}
            selectedCurrency={currency}
            onCurrencyChange={setCurrency}
          />
        )}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function SalesData({
  data,
  view,
  selectedCurrency,
  onCurrencyChange,
}: {
  data: SalesReport;
  view: SalesView;
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
      <Title>{salesViewTitle(view)}</Title>
      {view === "pos-branch" ? <Body>Online sales are not assigned to a Branch.</Body> : null}
      {groups.map((group) => (
        <SalesViewRows key={group.currency} group={group} view={view} />
      ))}
    </View>
  );
}

function salesViewTitle(view: SalesView): string {
  switch (view) {
    case "trend":
      return "Sales trend";
    case "channel":
      return "Sales by channel";
    case "brand":
      return "Sales by Brand";
    case "pos-branch":
      return "POS sales by branch";
    case "pos-register":
      return "POS sales by register";
    case "pos-operator":
      return "POS sales by operator";
  }
}

function SalesViewRows({ group, view }: { group: CurrencySalesGroup; view: SalesView }) {
  if (view === "trend") {
    return (
      <CurrencySection currency={group.currency}>
        {group.trend.map((point) => (
          <SurfaceRow key={point.fromInclusive}>
            <Title>{point.label}</Title>
            <InfoRow label="From" value={point.fromInclusive} />
            <InfoRow label="To" value={point.toExclusive} />
            <InfoRow label="Net" value={formatMoneyMinor(point.netMinor, group.currency)} />
            <InfoRow label="Orders" value={String(point.orders)} />
          </SurfaceRow>
        ))}
      </CurrencySection>
    );
  }
  const rows =
    view === "channel"
      ? group.channels
      : view === "brand"
        ? group.brands
        : view === "pos-branch"
          ? group.posBranches
          : view === "pos-register"
            ? group.posRegisters
            : group.posOperators;
  return (
    <CurrencySection currency={group.currency}>
      {rows.map((row) => (
        <SurfaceRow key={row.id}>
          <Title>{row.label}</Title>
          <InfoRow label="Gross" value={formatMoneyMinor(row.grossMinor, group.currency)} />
          <InfoRow label="Discount" value={formatMoneyMinor(row.discountMinor, group.currency)} />
          <InfoRow label="Net" value={formatMoneyMinor(row.netMinor, group.currency)} />
          <InfoRow label="Orders" value={String(row.orders)} />
        </SurfaceRow>
      ))}
    </CurrencySection>
  );
}

export function ProductsReportScreen(props: ReportScreenProps) {
  if (!props.canRead || !props.adapter) {
    return (
      <ReportingUnavailable title="Product sales" canRead={props.canRead} onBack={props.onBack} />
    );
  }
  return <ProductsContent {...props} adapter={props.adapter} />;
}

function ProductsContent({ adapter, onBack }: ReportScreenProps & { adapter: ReportingAdapter }) {
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [ranking, setRanking] = useState<"product" | "variant">("product");
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getProductSales({ range, cursor: pager.cursor }, ranking),
    [adapter, range, pager.cursor, ranking],
  );
  const { state, reload } = useAsync(load);
  function changeRanking(value: string) {
    pager.reset();
    setRanking(value as "product" | "variant");
  }
  return (
    <ReportPageFrame title="Products" onBack={onBack}>
      <DateRangeControls
        value={range}
        onChange={(next) => {
          pager.reset();
          setRange(next);
        }}
      />
      <SelectField
        label="Ranking"
        selected={ranking}
        onSelect={changeRanking}
        testIDPrefix="product-ranking"
        options={[
          { value: "product", label: "Product ranking" },
          { value: "variant", label: "Variant ranking" },
        ]}
      />
      <ExportReserved dataset="Product/Variant sales" />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.items.items.length === 0}
        emptyMessage="No Product or Variant sales exist for this period."
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
      <Eyebrow>{row.currency}</Eyebrow>
      <Title>{row.productName}</Title>
      {row.variantName ? <Body>{row.variantName}</Body> : null}
      {row.sku ? <InfoRow label="SKU" value={row.sku} /> : null}
      <InfoRow label="Units sold" value={String(row.unitsSold)} />
      <InfoRow label="Gross" value={formatMoneyMinor(row.grossMinor, row.currency)} />
      <InfoRow label="Discount" value={formatMoneyMinor(row.discountMinor, row.currency)} />
      <InfoRow label="Net" value={formatMoneyMinor(row.netMinor, row.currency)} />
      {row.noSalesWithCurrentStock ? <Body>No sales in period with current stock</Body> : null}
    </SurfaceRow>
  );
}

type InventoryView = "balances" | "movements" | InventoryMovementKind;

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

function InventoryContent({ adapter, onBack }: ReportScreenProps & { adapter: ReportingAdapter }) {
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const [view, setView] = useState<InventoryView>("balances");
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getInventory({ range, cursor: pager.cursor }),
    [adapter, range, pager.cursor],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Inventory" onBack={onBack}>
      <DateRangeControls
        value={range}
        onChange={(next) => {
          pager.reset();
          setRange(next);
        }}
      />
      <SelectField
        label="View"
        selected={view}
        onSelect={(value) => {
          pager.reset();
          setView(value as InventoryView);
        }}
        testIDPrefix="inventory-view"
        options={[
          { value: "balances", label: "Current balances" },
          { value: "movements", label: "Movements" },
          { value: "receipt", label: "Receipts" },
          { value: "transfer", label: "Transfers" },
          { value: "adjustment", label: "Adjustments" },
        ]}
      />
      <ExportReserved dataset="Inventory movements" />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.balances.length === 0 && data.movements.items.length === 0}
        emptyMessage="No Inventory balances or movements are available."
      >
        {(data) => <InventoryData data={data} view={view} pager={pager} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function InventoryData({
  data,
  view,
  pager,
}: {
  data: InventoryReport;
  view: InventoryView;
  pager: CursorPager;
}) {
  const rows =
    view === "movements"
      ? data.movements.items
      : data.movements.items.filter((row) => row.kind === view);
  return (
    <View style={{ gap: 12 }}>
      <ReportMetaBlock meta={data.meta} />
      <Body>
        InventoryLocation is the stock-holding identity; it is not a Branch, Warehouse, or Register.
      </Body>
      <Title>{view === "balances" ? "Current balances" : inventoryViewTitle(view)}</Title>
      {view === "balances"
        ? data.balances.map((row) => (
            <SurfaceRow key={row.id}>
              <Title>{row.productName}</Title>
              <Body>{row.variantName}</Body>
              <InfoRow label="InventoryLocation" value={row.inventoryLocationName} />
              <InfoRow label="On hand" value={String(row.onHand)} />
            </SurfaceRow>
          ))
        : rows.map((row) => (
            <SurfaceRow key={row.id}>
              <Eyebrow>{row.kind}</Eyebrow>
              <Title>{row.productName}</Title>
              <Body>{row.variantName}</Body>
              <InfoRow label="InventoryLocation" value={row.inventoryLocationName} />
              {row.relatedInventoryLocationName ? (
                <InfoRow
                  label="Related InventoryLocation"
                  value={row.relatedInventoryLocationName}
                />
              ) : null}
              <InfoRow label="Quantity" value={String(row.quantity)} />
              <InfoRow label="Occurred" value={row.occurredAt} />
            </SurfaceRow>
          ))}
      {view !== "balances" ? (
        <PaginationControls
          canPrevious={pager.canPrevious}
          canNext={data.movements.nextCursor !== null}
          onPrevious={pager.previous}
          onNext={() => pager.next(data.movements.nextCursor)}
        />
      ) : null}
    </View>
  );
}

function inventoryViewTitle(view: InventoryView): string {
  if (view === "movements") return "Inventory movements";
  if (view === "receipt") return "Receipts";
  if (view === "transfer") return "Transfers";
  if (view === "adjustment") return "Adjustments";
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

function ReturnsContent({ adapter, onBack }: ReportScreenProps & { adapter: ReportingAdapter }) {
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getReturns({ range, cursor: pager.cursor }),
    [adapter, range, pager.cursor],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Returns and refunds" onBack={onBack}>
      <DateRangeControls
        value={range}
        onChange={(next) => {
          pager.reset();
          setRange(next);
        }}
      />
      <ExportReserved dataset="Returns/refunds" />
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
      <Title>Returned Product/Variant rankings</Title>
      {data.products.items.map((row) => (
        <SurfaceRow key={`${row.currency}-${row.id}`}>
          <Eyebrow>{row.currency}</Eyebrow>
          <Title>{row.productName}</Title>
          {row.variantName ? <Body>{row.variantName}</Body> : null}
          <InfoRow label="Returned units" value={String(row.returnedUnits)} />
          <InfoRow label="Disposition" value={row.disposition} />
          <InfoRow label="Accepted value" value={formatMoneyMinor(row.netMinor, row.currency)} />
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
  if (!props.canRead || !props.adapter)
    return (
      <ReportingUnavailable
        title="Promotion reporting"
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  return <PromotionsContent {...props} adapter={props.adapter} />;
}

function PromotionsContent({ adapter, onBack }: ReportScreenProps & { adapter: ReportingAdapter }) {
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getPromotions({ range, cursor: pager.cursor }),
    [adapter, range, pager.cursor],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Promotions" onBack={onBack}>
      <DateRangeControls
        value={range}
        onChange={(next) => {
          pager.reset();
          setRange(next);
        }}
      />
      <ReportAsyncState
        state={state}
        reload={reload}
        isEmpty={(data) => data.promotions.items.length === 0}
        emptyMessage="No Promotion redemptions exist for this period."
      >
        {(data) => <PromotionsData data={data} pager={pager} />}
      </ReportAsyncState>
    </ReportPageFrame>
  );
}

function PromotionsData({ data, pager }: { data: PromotionsReport; pager: CursorPager }) {
  return (
    <View style={{ gap: 12 }}>
      <ReportMetaBlock meta={data.meta} />
      {data.promotions.items.map((row) => (
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
        </SurfaceRow>
      ))}
      <PaginationControls
        canPrevious={pager.canPrevious}
        canNext={data.promotions.nextCursor !== null}
        onPrevious={pager.previous}
        onNext={() => pager.next(data.promotions.nextCursor)}
      />
    </View>
  );
}

export function SuppliersReportScreen(props: ReportScreenProps) {
  if (!props.canRead || !props.adapter)
    return (
      <ReportingUnavailable
        title="Supplier reporting"
        canRead={props.canRead}
        onBack={props.onBack}
      />
    );
  return <SuppliersContent {...props} adapter={props.adapter} />;
}

function SuppliersContent({ adapter, onBack }: ReportScreenProps & { adapter: ReportingAdapter }) {
  const [range, setRange] = useState<ReportDateRange>(DEFAULT_REPORT_RANGE);
  const pager = useCursorPager();
  const load = useCallback(
    () => adapter.getSuppliers({ range, cursor: pager.cursor }),
    [adapter, range, pager.cursor],
  );
  const { state, reload } = useAsync(load);
  return (
    <ReportPageFrame title="Suppliers" onBack={onBack}>
      <DateRangeControls
        value={range}
        onChange={(next) => {
          pager.reset();
          setRange(next);
        }}
      />
      <ExportReserved dataset="Supplier receipt history" />
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
