import { useState, type ReactNode } from "react";
import { View } from "react-native";

import type { CommerceErrorKind } from "../commerce/errors";
import { t, useI18n, type MessageKey } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
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

const DATE_PRESET_KEYS: { value: DatePreset; labelKey: MessageKey }[] = [
  { value: "today", labelKey: "report.datePreset.today" },
  { value: "7-days", labelKey: "report.datePreset.7days" },
  { value: "30-days", labelKey: "report.datePreset.30days" },
  { value: "custom", labelKey: "report.datePreset.custom" },
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
  const { t } = useI18n();
  return (
    <ScrollScreen>
      <PageHeader eyebrow={t("report.eyebrow")} title={title} onBack={onBack} />
      <Title>{canRead ? t("report.unavailableTitle") : t("report.accessDeniedTitle")}</Title>
      <Body testID={canRead ? "reporting-transport-pending" : "reporting-access-denied"}>
        {canRead ? t("report.unavailableBody") : t("report.accessDeniedBody")}
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
  const { t } = useI18n();
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
        label={t("report.dateRange")}
        options={DATE_PRESET_KEYS.map((p) => ({ value: p.value, label: t(p.labelKey) }))}
        selected={selected}
        onSelect={choose}
        testIDPrefix="report-date-preset"
      />
      {selected === "custom" ? (
        <View style={{ gap: 10 }}>
          <TextField
            label={t("report.from")}
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            testID="report-date-from"
          />
          <TextField
            label={t("report.to")}
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            testID="report-date-to"
          />
          {error ? <Body testID="report-date-error">{error}</Body> : null}
          <PrimaryButton label={t("report.applyCustom")} onPress={applyCustom} />
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
  const { t } = useI18n();
  const unique = [...new Set(currencies)];
  if (unique.length <= 1) return null;
  return (
    <SelectField
      label={t("report.currency")}
      options={[
        { value: "__all", label: t("report.allCurrencies") },
        ...unique.map((currency) => ({ value: currency, label: currency })),
      ]}
      selected={selected ?? "__all"}
      onSelect={(value) => onChange(value === "__all" ? undefined : value)}
      testIDPrefix="report-currency"
    />
  );
}

export function ReportMetaBlock({ meta }: { meta: ReportMeta }) {
  const { t } = useI18n();
  return (
    <View testID="report-meta" style={{ gap: 4 }}>
      <InfoRow label={t("report.timezone")} value={meta.timezone} />
      <InfoRow label={t("report.fromInclusive")} value={meta.fromInclusive} />
      <InfoRow label={t("report.toExclusive")} value={meta.toExclusive} />
      <Body>{t("report.metaNote")}</Body>
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
  const { t } = useI18n();
  if (state.status === "loading") return <LoadingBlock label={t("report.loading")} />;
  if (state.status === "error") {
    return (
      <View testID="report-error" style={{ gap: 10 }}>
        <Title>{errorHeading(state.error.kind)}</Title>
        <Body>{reportErrorMessage(state.error.kind)}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label={t("common.tryAgain")} onPress={reload} />
        ) : null}
      </View>
    );
  }
  if (isEmpty(state.data)) {
    return (
      <View style={{ gap: 10 }}>
        <Body testID="report-empty">{emptyMessage}</Body>
        <PrimaryButton label={t("report.refresh")} onPress={reload} />
      </View>
    );
  }
  return (
    <View style={{ gap: 14 }}>
      {children(state.data)}
      <Divider />
      <PrimaryButton label={t("report.refresh")} onPress={reload} />
    </View>
  );
}

function reportErrorMessage(kind: CommerceErrorKind): string {
  switch (kind) {
    case "auth":
      return t("report.errAuth");
    case "forbidden":
      return t("report.errForbidden");
    case "network":
      return t("report.errNetwork");
    case "validation":
      return t("report.errValidation");
    case "contract":
    case "server":
    case "unknown":
    case "not-found":
    default:
      return t("report.errDefault");
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
  const { t } = useI18n();
  return (
    <ScrollScreen>
      <PageHeader eyebrow={t("report.eyebrow")} title={title} onBack={onBack} />
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
  const { t } = useI18n();
  return (
    <View testID="report-pagination" style={{ gap: 8 }}>
      <PrimaryButton
        label={t("report.previousPage")}
        disabled={!canPrevious}
        onPress={onPrevious}
      />
      <PrimaryButton label={t("report.nextPage")} disabled={!canNext} onPress={onNext} />
    </View>
  );
}
