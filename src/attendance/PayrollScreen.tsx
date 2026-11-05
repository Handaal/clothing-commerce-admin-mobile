import type { MeContextResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { OPERATING_CURRENCY } from "../commerce/currency";
import { useI18n } from "../i18n";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  ConfirmButton,
  Divider,
  FormSection,
  InfoRow,
  LoadingBlock,
  Notice,
  NumberField,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  SelectField,
  Surface,
  SurfaceRow,
  TextButton,
  TextField,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { useToast } from "../ui/Toast";
import {
  attendanceCapabilities,
  defaultDateRange,
  formatMinutes,
  parseHours,
  parseMoneyInput,
  validateDateRange,
  type AdjustmentListResponse,
  type AdjustmentType,
  type DateRange,
  type LeaveListResponse,
  type PayrollReportResponse,
  type PayrollSettings,
} from "./model";

export interface PayrollScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack: () => void;
}

/**
 * Computed payroll over a date range plus the inputs that shape it: per-member compensation, dated
 * bonus/deduction adjustments, tenant payroll settings, and the mid-shift leave log. Reads are gated by
 * the staff capability as a proxy (there is no dedicated attendance flag); the API authorizes each call.
 */
export function PayrollScreen({ tenantId, context, onBack }: PayrollScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const caps = attendanceCapabilities(context);
  const [range, setRange] = useState<DateRange>(() => defaultDateRange());
  const [applied, setApplied] = useState<DateRange>(range);
  const [rangeError, setRangeError] = useState<string | null>(null);

  if (!caps.canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow={t("payroll.eyebrow")} title={t("payroll.title")} icon="cash-multiple" onBack={onBack} />
        <Notice tone="warning" title={t("attendance.accessTitle")} message={t("attendance.accessBody")} />
      </ScrollScreen>
    );
  }

  function applyRange() {
    const problem = validateDateRange(range);
    setRangeError(problem);
    if (!problem) setApplied({ from: range.from.trim(), to: range.to.trim() });
  }

  return (
    <ScrollScreen>
      <PageHeader eyebrow={t("payroll.eyebrow")} title={t("payroll.title")} description={t("payroll.headerDesc")} icon="cash-multiple" onBack={onBack} />

      <Surface tone="accent">
        <SectionHeading title={t("payroll.range")} detail={t("payroll.rangeDetail")} />
        <TextField label={t("payroll.from")} value={range.from} onChangeText={(v) => setRange((r) => ({ ...r, from: v }))} placeholder="2026-09-01" testID="payroll-from" autoCapitalize="none" />
        <TextField label={t("payroll.to")} value={range.to} onChangeText={(v) => setRange((r) => ({ ...r, to: v }))} placeholder="2026-09-30" testID="payroll-to" autoCapitalize="none" />
        {rangeError ? <Body>{rangeError}</Body> : null}
        <PrimaryButton label={t("payroll.apply")} icon="calendar-check" testID="payroll-apply" onPress={applyRange} />
      </Surface>

      <PayrollReport client={client} range={applied} />
      <Adjustments client={client} range={applied} canManage={caps.canManage} />
      <LeaveLog client={client} range={applied} />
      {caps.canManage ? <PayrollSettingsForm client={client} /> : null}
      {caps.canManage ? <CompensationForm client={client} /> : null}
    </ScrollScreen>
  );
}

// ── Computed payroll ─────────────────────────────────────────────────────────────────────────────

function PayrollReport({ client, range }: { client: Pick<TenantCommerceClient, "getPayrollReport">; range: DateRange }) {
  const { t } = useI18n();
  const load = useCallback(() => client.getPayrollReport(range), [client, range]);
  const { state, reload } = useAsync<PayrollReportResponse>(load);

  return (
    <FormSection title={t("payroll.reportSection")} description={t("payroll.reportDesc")} icon="file-chart-outline">
      {state.status === "loading" ? <LoadingBlock label={t("payroll.loading")} /> : null}
      {state.status === "error" ? <RangeError kind={state.error.kind} message={state.error.message} onRetry={reload} /> : null}
      {state.status === "success" ? (
        state.data.items.length === 0 ? (
          <Notice testID="payroll-empty" message={t("payroll.empty")} />
        ) : (
          <View style={{ gap: 8 }} testID="payroll-report">
            {state.data.items.map((row) => (
              <SurfaceRow key={row.membershipId} testID={`payroll-row-${row.membershipId}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Title>{row.memberDisplayName ?? row.memberEmail ?? row.membershipId}</Title>
                  <Badge label={formatMoneyMinor(row.netPayMinor, row.currency)} tone="success" />
                </View>
                <InfoRow label={t("payroll.worked")} value={`${row.workedHours}h`} />
                <InfoRow label={t("payroll.overtime")} value={`${row.overtimeHours}h · ${formatMoneyMinor(row.overtimeAmountMinor, row.currency)}`} />
                <InfoRow label={t("payroll.base")} value={formatMoneyMinor(row.baseSalaryMinor, row.currency)} />
                <InfoRow label={t("payroll.bonus")} value={formatMoneyMinor(row.bonusMinor, row.currency)} />
                <InfoRow label={t("payroll.deduction")} value={formatMoneyMinor(row.deductionMinor, row.currency)} />
              </SurfaceRow>
            ))}
            <Divider />
            <Surface tone="brand" testID="payroll-totals">
              <SectionHeading title={t("payroll.totals")} />
              <InfoRow label={t("payroll.base")} value={formatMinor(state.data.totals.baseSalaryMinor)} />
              <InfoRow label={t("payroll.overtime")} value={formatMinor(state.data.totals.overtimeAmountMinor)} />
              <InfoRow label={t("payroll.bonus")} value={formatMinor(state.data.totals.bonusMinor)} />
              <InfoRow label={t("payroll.deduction")} value={formatMinor(state.data.totals.deductionMinor)} />
              <InfoRow label={t("payroll.net")} value={formatMinor(state.data.totals.netPayMinor)} />
            </Surface>
          </View>
        )
      ) : null}
    </FormSection>
  );
}

// Totals carry no currency field; show the raw minor-unit decimal (reporting aggregate, not a price tag).
function formatMinor(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}

// ── Adjustments ──────────────────────────────────────────────────────────────────────────────────

function Adjustments({
  client,
  range,
  canManage,
}: {
  client: Pick<TenantCommerceClient, "listAdjustments" | "createAdjustment" | "removeAdjustment">;
  range: DateRange;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => client.listAdjustments(range), [client, range]);
  const { state, reload } = useAsync<AdjustmentListResponse>(load);

  const [membershipId, setMembershipId] = useState("");
  const [type, setType] = useState<AdjustmentType>("bonus");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(done);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("payroll.adjFailed"));
    } finally {
      setBusy(false);
    }
  }

  function onCreate() {
    const parsed = parseMoneyInput(amount);
    if (!membershipId.trim()) {
      setFormError(t("payroll.errMembership"));
      return;
    }
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    void run(
      () =>
        client.createAdjustment({
          membershipId: membershipId.trim(),
          type,
          amountMinor: parsed.amountMinor,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      t("payroll.adjCreatedToast"),
    ).then(() => {
      setMembershipId("");
      setAmount("");
      setReason("");
    });
  }

  return (
    <FormSection title={t("payroll.adjSection")} description={t("payroll.adjDesc")} icon="plus-minus-variant">
      {canManage ? (
        <Surface testID="payroll-adj-form">
          <TextField label={t("attendance.membershipId")} value={membershipId} onChangeText={setMembershipId} testID="payroll-adj-membership" autoCapitalize="none" />
          <SelectField
            label={t("payroll.adjType")}
            options={[
              { value: "bonus", label: t("payroll.bonus") },
              { value: "deduction", label: t("payroll.deduction") },
            ]}
            selected={type}
            onSelect={(v) => setType(v as AdjustmentType)}
            testIDPrefix="payroll-adj-type"
          />
          <NumberField label={t("payroll.amount")} value={amount} onChangeText={setAmount} testID="payroll-adj-amount" />
          <TextField label={t("payroll.reasonOptional")} value={reason} onChangeText={setReason} testID="payroll-adj-reason" />
          {formError ? <Body>{formError}</Body> : null}
          <PrimaryButton label={busy ? t("common.saving") : t("payroll.addAdjustment")} icon="plus" testID="payroll-adj-submit" disabled={busy} onPress={onCreate} />
        </Surface>
      ) : null}

      {state.status === "loading" ? <LoadingBlock label={t("payroll.loading")} /> : null}
      {state.status === "error" ? <RangeError kind={state.error.kind} message={state.error.message} onRetry={reload} /> : null}
      {state.status === "success" ? (
        state.data.items.length === 0 ? (
          <Notice testID="payroll-adj-empty" message={t("payroll.adjEmpty")} />
        ) : (
          <View style={{ gap: 8 }}>
            {state.data.items.map((adj) => (
              <SurfaceRow key={adj.id} testID={`payroll-adj-${adj.id}`}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <Title>{adj.memberDisplayName ?? adj.membershipId}</Title>
                  <Badge label={t(adj.type === "bonus" ? "payroll.bonus" : "payroll.deduction")} tone={adj.type === "bonus" ? "success" : "danger"} />
                </View>
                <InfoRow label={t("payroll.amount")} value={formatMinor(adj.amountMinor)} />
                <InfoRow label={t("payroll.effective")} value={adj.effectiveDate} />
                {adj.reason ? <InfoRow label={t("payroll.reasonOptional")} value={adj.reason} /> : null}
                {canManage ? (
                  <ConfirmButton
                    label={t("payroll.removeAdjustment")}
                    confirmLabel={t("payroll.removeAdjustment")}
                    disabled={busy}
                    testID={`payroll-adj-remove-${adj.id}`}
                    onConfirm={() => run(() => client.removeAdjustment(adj.id), t("payroll.adjRemovedToast"))}
                  />
                ) : null}
              </SurfaceRow>
            ))}
          </View>
        )
      ) : null}
    </FormSection>
  );
}

// ── Leave log ────────────────────────────────────────────────────────────────────────────────────

function LeaveLog({ client, range }: { client: Pick<TenantCommerceClient, "listLeaves">; range: DateRange }) {
  const { t } = useI18n();
  const load = useCallback(() => client.listLeaves(range), [client, range]);
  const { state, reload } = useAsync<LeaveListResponse>(load);

  return (
    <FormSection title={t("payroll.leaveSection")} description={t("payroll.leaveDesc")} icon="walk">
      {state.status === "loading" ? <LoadingBlock label={t("payroll.loading")} /> : null}
      {state.status === "error" ? <RangeError kind={state.error.kind} message={state.error.message} onRetry={reload} /> : null}
      {state.status === "success" ? (
        state.data.items.length === 0 ? (
          <Notice testID="payroll-leave-empty" message={t("payroll.leaveEmpty")} />
        ) : (
          <View style={{ gap: 8 }}>
            {state.data.items.map((leave) => (
              <SurfaceRow key={leave.id} testID={`payroll-leave-${leave.id}`}>
                <Title>{leave.memberDisplayName ?? leave.membershipId}</Title>
                <InfoRow label={t("payroll.leftAt")} value={leave.leftAt} />
                <InfoRow label={t("payroll.returnedAt")} value={leave.returnedAt ?? t("attendance.open")} />
                <InfoRow label={t("payroll.leaveMinutes")} value={formatMinutes(leave.minutes)} />
              </SurfaceRow>
            ))}
          </View>
        )
      ) : null}
    </FormSection>
  );
}

// ── Payroll settings ─────────────────────────────────────────────────────────────────────────────

function PayrollSettingsForm({ client }: { client: Pick<TenantCommerceClient, "getPayrollSettings" | "updatePayrollSettings"> }) {
  const { t } = useI18n();
  const load = useCallback(() => client.getPayrollSettings(), [client]);
  const { state, reload } = useAsync<PayrollSettings>(load);

  return (
    <FormSection title={t("payroll.settingsSection")} description={t("payroll.settingsDesc")} icon="cog-outline">
      {state.status === "loading" ? <LoadingBlock label={t("payroll.loading")} /> : null}
      {state.status === "error" ? <RangeError kind={state.error.kind} message={state.error.message} onRetry={reload} /> : null}
      {state.status === "success" ? (
        // Remount on each loaded value so the editor's useState initializer seeds from the server once,
        // without a setState-during-render or a set-state-in-effect.
        <SettingsEditor
          key={`${state.data.normalHours}:${state.data.shiftDurationHours}`}
          client={client}
          initial={state.data}
          onSaved={reload}
        />
      ) : null}
    </FormSection>
  );
}

function SettingsEditor({
  client,
  initial,
  onSaved,
}: {
  client: Pick<TenantCommerceClient, "updatePayrollSettings">;
  initial: PayrollSettings;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [normalHours, setNormalHours] = useState(String(initial.normalHours));
  const [shiftHours, setShiftHours] = useState(String(initial.shiftDurationHours));
  const [busy, setBusy] = useState(false);

  async function onSave() {
    const nh = Number(normalHours);
    const sh = Number(shiftHours);
    if (!Number.isFinite(nh) || nh <= 0 || !Number.isFinite(sh) || sh <= 0) {
      toast.error(t("payroll.errSettings"));
      return;
    }
    setBusy(true);
    try {
      await client.updatePayrollSettings({ normalHours: nh, shiftDurationHours: sh });
      toast.success(t("payroll.settingsSavedToast"));
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("payroll.settingsFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View testID="payroll-settings-form">
      <NumberField label={t("payroll.normalHours")} value={normalHours} onChangeText={setNormalHours} testID="payroll-normal-hours" />
      <NumberField label={t("payroll.shiftHours")} value={shiftHours} onChangeText={setShiftHours} testID="payroll-shift-hours" />
      <PrimaryButton label={busy ? t("common.saving") : t("common.saveChanges")} icon="content-save-outline" testID="payroll-settings-submit" disabled={busy} onPress={onSave} />
    </View>
  );
}

// ── Compensation ─────────────────────────────────────────────────────────────────────────────────

function CompensationForm({ client }: { client: Pick<TenantCommerceClient, "setCompensation"> }) {
  const { t } = useI18n();
  const toast = useToast();
  const [membershipId, setMembershipId] = useState("");
  const [base, setBase] = useState("");
  const [overtimeRate, setOvertimeRate] = useState("");
  const [normalHours, setNormalHours] = useState("");
  // Compensation currency is locked to the single operating currency; the field below is read-only.
  const [currency, setCurrency] = useState(OPERATING_CURRENCY);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSave() {
    const baseParsed = parseMoneyInput(base);
    const otParsed = parseMoneyInput(overtimeRate);
    const hoursParsed = parseHours(normalHours);
    if (!membershipId.trim() || !currency.trim()) {
      setFormError(t("payroll.errCompFields"));
      return;
    }
    if (!baseParsed.ok) return setFormError(baseParsed.error);
    if (!otParsed.ok) return setFormError(otParsed.error);
    if (!hoursParsed.ok) return setFormError(hoursParsed.error);
    setFormError(null);
    setBusy(true);
    try {
      await client.setCompensation({
        membershipId: membershipId.trim(),
        baseSalaryMinor: baseParsed.amountMinor,
        overtimeRateMinor: otParsed.amountMinor,
        normalHours: hoursParsed.hours,
        currency: currency.trim().toUpperCase(),
      });
      toast.success(t("payroll.compSavedToast"));
      setMembershipId("");
      setBase("");
      setOvertimeRate("");
      setNormalHours("");
      setCurrency(OPERATING_CURRENCY);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("payroll.compFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormSection title={t("payroll.compSection")} description={t("payroll.compDesc")} icon="account-cash-outline">
      <View testID="payroll-comp-form">
        <TextField label={t("attendance.membershipId")} value={membershipId} onChangeText={setMembershipId} testID="payroll-comp-membership" autoCapitalize="none" />
        <NumberField label={t("payroll.baseSalary")} value={base} onChangeText={setBase} testID="payroll-comp-base" />
        <NumberField label={t("payroll.overtimeRate")} value={overtimeRate} onChangeText={setOvertimeRate} testID="payroll-comp-ot" />
        <NumberField label={t("payroll.normalHours")} value={normalHours} onChangeText={setNormalHours} testID="payroll-comp-hours" />
        <InfoRow label={t("payroll.currency")} value={currency} testID="payroll-comp-currency" />
        {formError ? <Body>{formError}</Body> : null}
        <PrimaryButton label={busy ? t("common.saving") : t("payroll.setCompensation")} icon="content-save-outline" testID="payroll-comp-submit" disabled={busy} onPress={onSave} />
      </View>
    </FormSection>
  );
}

function RangeError({ kind, message, onRetry }: { kind: Parameters<typeof errorHeading>[0]; message: string; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <Notice
      tone="danger"
      title={errorHeading(kind)}
      message={message}
      action={isRetryable(kind) ? <TextButton label={t("common.tryAgain")} icon="refresh" onPress={onRetry} /> : undefined}
    />
  );
}
