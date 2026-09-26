import { useState, type ReactNode } from "react";
import { View } from "react-native";

import { errorHeading, isRetryable } from "../products/display";
import type { CommerceErrorKind } from "../commerce/errors";
import {
  Body,
  Divider,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  TextField,
  Title,
} from "../ui/components";
import type { AsyncState } from "../ui/useAsync";
import { customDateRange, validateCustomDateRange } from "./date-range";
import type { DatePreset, ReportDateRange, ReportMeta } from "./model";

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7-days", label: "7 days" },
  { value: "30-days", label: "30 days" },
  { value: "custom", label: "Custom" },
];

export function ReportingUnavailable({
  title,
  canRead,
  onBack,
}: {
  title: string;
  canRead: boolean;
  onBack: () => void;
}) {
  return (
    <ScrollScreen>
      <PageHeader eyebrow="Reporting" title={title} onBack={onBack} />
      <Title>{canRead ? "Reporting is unavailable" : "Access denied"}</Title>
      <Body testID={canRead ? "reporting-transport-pending" : "reporting-access-denied"}>
        {canRead
          ? "Reporting could not be initialized. No reporting data has been requested."
          : "Your current business access does not include reporting."}
      </Body>
    </ScrollScreen>
  );
}

export function DateRangeControls({
  value,
  onChange,
}: {
  value: ReportDateRange;
  onChange: (value: ReportDateRange) => void;
}) {
  const [selected, setSelected] = useState<DatePreset>(value.preset);
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const [error, setError] = useState<string | null>(null);

  function choose(next: string) {
    const preset = next as DatePreset;
    setSelected(preset);
    setError(null);
    if (preset !== "custom") onChange({ preset });
  }

  function applyCustom() {
    const validation = validateCustomDateRange(from, to);
    setError(validation);
    const range = customDateRange(from, to);
    if (range) onChange(range);
  }

  return (
    <View style={{ gap: 10 }}>
      <SelectField
        label="Date range"
        options={DATE_PRESETS}
        selected={selected}
        onSelect={choose}
        testIDPrefix="report-date-preset"
      />
      {selected === "custom" ? (
        <View style={{ gap: 10 }}>
          <TextField
            label="From (tenant-local date)"
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            testID="report-date-from"
          />
          <TextField
            label="To (tenant-local date)"
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            testID="report-date-to"
          />
          {error ? <Body testID="report-date-error">{error}</Body> : null}
          <PrimaryButton label="Apply custom range" onPress={applyCustom} />
        </View>
      ) : null}
    </View>
  );
}

export function CurrencySelector({
  currencies,
  selected,
  onChange,
}: {
  currencies: string[];
  selected?: string;
  onChange: (currency: string | undefined) => void;
}) {
  const unique = [...new Set(currencies)];
  if (unique.length <= 1) return null;
  return (
    <SelectField
      label="Currency"
      options={[
        { value: "__all", label: "All currencies (shown separately)" },
        ...unique.map((currency) => ({ value: currency, label: currency })),
      ]}
      selected={selected ?? "__all"}
      onSelect={(value) => onChange(value === "__all" ? undefined : value)}
      testIDPrefix="report-currency"
    />
  );
}

export function ReportMetaBlock({ meta }: { meta: ReportMeta }) {
  return (
    <View testID="report-meta" style={{ gap: 4 }}>
      <InfoRow label="Reporting timezone" value={meta.timezone} />
      <InfoRow label="From (inclusive)" value={meta.fromInclusive} />
      <InfoRow label="To (exclusive)" value={meta.toExclusive} />
      <Body>Calendar dates and bucket boundaries are supplied by the reporting service.</Body>
    </View>
  );
}

export function ReportAsyncState<T>({
  state,
  reload,
  isEmpty,
  emptyMessage,
  children,
}: {
  state: AsyncState<T>;
  reload: () => void;
  isEmpty: (data: T) => boolean;
  emptyMessage: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") return <LoadingBlock label="Loading reportâ€¦" />;
  if (state.status === "error") {
    return (
      <View testID="report-error" style={{ gap: 10 }}>
        <Title>{errorHeading(state.error.kind)}</Title>
        <Body>{reportErrorMessage(state.error.kind)}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label="Try again" onPress={reload} />
        ) : null}
      </View>
    );
  }
  if (isEmpty(state.data)) {
    return (
      <View style={{ gap: 10 }}>
        <Body testID="report-empty">{emptyMessage}</Body>
        <PrimaryButton label="Refresh" onPress={reload} />
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {children(state.data)}
      <Divider />
      <PrimaryButton label="Refresh" onPress={reload} />
    </View>
  );
}

function reportErrorMessage(kind: CommerceErrorKind): string {
  switch (kind) {
    case "auth":
      return "Sign in again to view reporting.";
    case "forbidden":
      return "You do not have access to this report.";
    case "network":
      return "Check your connection and try again. Reporting is online-only.";
    case "validation":
      return "Check the date range or page selection, then try again.";
    case "contract":
    case "server":
    case "unknown":
    case "not-found":
    default:
      return "The report could not be loaded. Try again.";
  }
}

export function ReportPageFrame({
  title,
  children,
  onBack,
}: {
  title: string;
  children: ReactNode;
  onBack: () => void;
}) {
  return (
    <ScrollScreen>
      <PageHeader eyebrow="Reporting" title={title} onBack={onBack} />
      {children}
    </ScrollScreen>
  );
}

export function PaginationControls({
  canPrevious,
  canNext,
  onPrevious,
  onNext,
}: {
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <View testID="report-pagination" style={{ gap: 8 }}>
      <PrimaryButton label="Previous page" disabled={!canPrevious} onPress={onPrevious} />
      <PrimaryButton label="Next page" disabled={!canNext} onPress={onNext} />
    </View>
  );
}
