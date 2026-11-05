import type { MeContextResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
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
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
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
  formatMinutes,
  type AttendanceListResponse,
  type MyAttendanceResponse,
} from "./model";

export interface AttendanceScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack: () => void;
  onOpenPayroll: () => void;
}

/**
 * Staff attendance management. Self-service clock in/out and leave for the signed-in member, plus the
 * tenant-wide workforce roster with manager-sanctioned manual entries. Every write goes through the
 * tenant-scoped SDK client and the Commerce API authorizes each one; manage affordances appear only
 * when the caller's staff capability allows it.
 */
export function AttendanceScreen({ tenantId, context, onBack, onOpenPayroll }: AttendanceScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const caps = attendanceCapabilities(context);

  if (!caps.canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow={t("attendance.eyebrow")} title={t("attendance.title")} icon="clock-outline" onBack={onBack} />
        <Notice tone="warning" title={t("attendance.accessTitle")} message={t("attendance.accessBody")} />
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("attendance.eyebrow")}
        title={t("attendance.title")}
        description={t("attendance.headerDesc")}
        icon="clock-outline"
        onBack={onBack}
      />
      <Surface tone="accent">
        <SectionHeading title={t("attendance.payrollLink")} detail={t("attendance.payrollLinkDetail")} />
        <PrimaryButton label={t("attendance.openPayroll")} icon="cash-multiple" variant="secondary" testID="attendance-open-payroll" onPress={onOpenPayroll} />
      </Surface>

      <MyAttendance client={client} />
      <LeaveSelf client={client} />
      <WorkforceRoster client={client} canManage={caps.canManage} />
    </ScrollScreen>
  );
}

// ── My attendance (self clock in / out) ──────────────────────────────────────────────────────────

function MyAttendance({ client }: { client: Pick<TenantCommerceClient, "getMyAttendance" | "clockIn" | "clockOut"> }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => client.getMyAttendance(), [client]);
  const { state, reload } = useAsync<MyAttendanceResponse>(load);

  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(done);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("attendance.clockFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormSection title={t("attendance.mySection")} icon="account-clock-outline">
      {state.status === "loading" ? <LoadingBlock label={t("attendance.loading")} /> : null}
      {state.status === "error" ? <RangeError kind={state.error.kind} message={state.error.message} onRetry={reload} /> : null}
      {state.status === "success" ? (
        <View style={{ gap: 8 }} testID="attendance-my">
          {state.data.openEntry ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Badge label={t("attendance.clockedIn")} tone="success" />
                <Body>{t("attendance.since", { when: state.data.openEntry.clockIn })}</Body>
              </View>
              <PrimaryButton
                label={busy ? t("common.saving") : t("attendance.clockOut")}
                icon="logout"
                testID="attendance-clock-out"
                disabled={busy}
                onPress={() => run(() => client.clockOut(), t("attendance.clockedOutToast"))}
              />
            </>
          ) : (
            <>
              <Badge label={t("attendance.clockedOut")} tone="neutral" />
              <PrimaryButton
                label={busy ? t("common.saving") : t("attendance.clockIn")}
                icon="login"
                testID="attendance-clock-in"
                disabled={busy}
                onPress={() => run(() => client.clockIn(), t("attendance.clockedInToast"))}
              />
            </>
          )}
          <Divider />
          <SectionHeading title={t("attendance.recentMine")} detail={t("common.shown", { count: state.data.entries.length })} />
          {state.data.entries.map((entry) => (
            <SurfaceRow key={entry.id} testID={`attendance-my-entry-${entry.id}`}>
              <InfoRow label={t("attendance.clockInLabel")} value={entry.clockIn} />
              <InfoRow label={t("attendance.clockOutLabel")} value={entry.clockOut ?? t("attendance.open")} />
              <InfoRow label={t("attendance.worked")} value={formatMinutes(entry.workedMinutes)} />
            </SurfaceRow>
          ))}
        </View>
      ) : null}
    </FormSection>
  );
}

// ── Self leave (mid-shift) ───────────────────────────────────────────────────────────────────────

function LeaveSelf({ client }: { client: Pick<TenantCommerceClient, "startLeave" | "endLeave"> }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("attendance.leaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormSection title={t("attendance.leaveSection")} description={t("attendance.leaveDesc")} icon="walk">
      <View style={{ flexDirection: "row", gap: 8 }}>
        <PrimaryButton
          label={t("attendance.startLeave")}
          icon="exit-run"
          variant="secondary"
          testID="attendance-start-leave"
          disabled={busy}
          onPress={() => run(() => client.startLeave(), t("attendance.leaveStartedToast"))}
        />
        <PrimaryButton
          label={t("attendance.endLeave")}
          icon="keyboard-return"
          variant="secondary"
          testID="attendance-end-leave"
          disabled={busy}
          onPress={() => run(() => client.endLeave(), t("attendance.leaveEndedToast"))}
        />
      </View>
    </FormSection>
  );
}

// ── Workforce roster (manager) ───────────────────────────────────────────────────────────────────

function WorkforceRoster({
  client,
  canManage,
}: {
  client: Pick<
    TenantCommerceClient,
    "listAttendance" | "addAttendanceEntry" | "updateAttendanceEntry" | "removeAttendanceEntry"
  >;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => client.listAttendance({ limit: 50 }), [client]);
  const { state, reload } = useAsync<AttendanceListResponse>(load);

  // Manual entry form state.
  const [membershipId, setMembershipId] = useState("");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(done);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("attendance.entryFailed"));
    } finally {
      setBusy(false);
    }
  }

  function onAdd() {
    if (!membershipId.trim() || !clockIn.trim()) {
      setFormError(t("attendance.errEntryFields"));
      return;
    }
    setFormError(null);
    void run(
      () =>
        client.addAttendanceEntry({
          membershipId: membershipId.trim(),
          clockIn: clockIn.trim(),
          ...(clockOut.trim() ? { clockOut: clockOut.trim() } : {}),
        }),
      t("attendance.entryAddedToast"),
    ).then(() => {
      setMembershipId("");
      setClockIn("");
      setClockOut("");
    });
  }

  return (
    <FormSection title={t("attendance.rosterSection")} description={t("attendance.rosterDesc")} icon="account-group-outline">
      {canManage ? (
        <Surface testID="attendance-add-entry-form">
          <SectionHeading title={t("attendance.addEntry")} detail={t("attendance.addEntryDetail")} />
          <TextField label={t("attendance.membershipId")} value={membershipId} onChangeText={setMembershipId} testID="attendance-entry-membership" autoCapitalize="none" />
          <TextField label={t("attendance.clockInLabel")} value={clockIn} onChangeText={setClockIn} placeholder="2026-10-01T09:00:00Z" testID="attendance-entry-clockin" autoCapitalize="none" hint={t("attendance.datetimeHint")} />
          <TextField label={t("attendance.clockOutOptional")} value={clockOut} onChangeText={setClockOut} placeholder="2026-10-01T17:00:00Z" testID="attendance-entry-clockout" autoCapitalize="none" />
          {formError ? <Body>{formError}</Body> : null}
          <PrimaryButton label={busy ? t("common.saving") : t("attendance.addEntry")} icon="plus" testID="attendance-entry-submit" disabled={busy} onPress={onAdd} />
        </Surface>
      ) : null}

      {state.status === "loading" ? <LoadingBlock label={t("attendance.loading")} /> : null}
      {state.status === "error" ? <RangeError kind={state.error.kind} message={state.error.message} onRetry={reload} /> : null}
      {state.status === "success" ? (
        state.data.items.length === 0 ? (
          <Notice testID="attendance-roster-empty" message={t("attendance.rosterEmpty")} />
        ) : (
          <View style={{ gap: 8 }}>
            {state.data.items.map((entry) => (
              <SurfaceRow key={entry.id} testID={`attendance-entry-${entry.id}`}>
                <Title>{entry.memberDisplayName ?? entry.memberEmail ?? entry.membershipId}</Title>
                <InfoRow label={t("attendance.clockInLabel")} value={entry.clockIn} />
                <InfoRow label={t("attendance.clockOutLabel")} value={entry.clockOut ?? t("attendance.open")} />
                <InfoRow label={t("attendance.worked")} value={formatMinutes(entry.workedMinutes)} />
                {entry.branchName ? <InfoRow label={t("attendance.branch")} value={entry.branchName} /> : null}
                {canManage ? (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {!entry.clockOut ? (
                      <PrimaryButton
                        label={t("attendance.setClockOutNow")}
                        icon="logout"
                        variant="secondary"
                        disabled={busy}
                        testID={`attendance-entry-close-${entry.id}`}
                        onPress={() =>
                          run(
                            () => client.updateAttendanceEntry({ entryId: entry.id, clockOut: new Date().toISOString() }),
                            t("attendance.entryUpdatedToast"),
                          )
                        }
                      />
                    ) : null}
                    <ConfirmButton
                      label={t("attendance.removeEntry")}
                      confirmLabel={t("attendance.removeEntry")}
                      disabled={busy}
                      testID={`attendance-entry-remove-${entry.id}`}
                      onConfirm={() => run(() => client.removeAttendanceEntry(entry.id), t("attendance.entryRemovedToast"))}
                    />
                  </View>
                ) : null}
              </SurfaceRow>
            ))}
          </View>
        )
      ) : null}
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
