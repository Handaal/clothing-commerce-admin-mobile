import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

import { parseAmountToMinor } from "../catalog/money";
import { t } from "../i18n";

/**
 * Staff attendance & payroll — the management-side counterpart of the POS attendance desk. These are
 * the local re-exports every attendance/payroll screen depends on (screens never import the SDK
 * directly) plus the React-free date-range and numeric validation the forms share.
 */
export type {
  Adjustment,
  AdjustmentListResponse,
  AdjustmentType,
  AttendanceClockResponse,
  AttendanceEntry,
  AttendanceListResponse,
  EmployeeCompensation,
  LeaveEntry,
  LeaveListResponse,
  MyAttendanceResponse,
  PayrollReportResponse,
  PayrollRow,
  PayrollSettings,
} from "@shifted/clothing-commerce-sdk";

/**
 * Attendance & payroll capability. There is no dedicated `access.attendance` flag on `/me/context`, so
 * — matching how the POS gates by role — this derives from the staff capability as the nearest proxy.
 * The Commerce API still authorizes every attendance/payroll call independently; this only decides
 * which affordances to show.
 */
export interface AttendanceCapabilities {
  canRead: boolean;
  canManage: boolean;
}

export function attendanceCapabilities(context: MeContextResponse): AttendanceCapabilities {
  const staff = context.access.staff;
  return { canRead: staff?.canRead ?? false, canManage: staff?.canManage ?? false };
}

export interface DateRange {
  from: string; // "YYYY-MM-DD"
  to: string; // "YYYY-MM-DD"
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The ISO date (UTC) component of a Date. */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A sensible default reporting window: the trailing 30 days through today (UTC). */
export function defaultDateRange(now: Date = new Date()): DateRange {
  const to = isoDate(now);
  const fromDate = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
  return { from: isoDate(fromDate), to };
}

/** Validate a reporting range. Returns `null` when usable; otherwise a human message. */
export function validateDateRange(range: DateRange): string | null {
  if (!ISO_DATE.test(range.from.trim()) || !ISO_DATE.test(range.to.trim())) {
    return t("attendance.errDateFormat");
  }
  if (range.from.trim() > range.to.trim()) {
    return t("attendance.errDateOrder");
  }
  return null;
}

/** Human "Xh Ym" from a minute count; "—" when unknown (an open or unmeasured entry). */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Parse a major-unit money input to minor, or a message. Zero/negative is rejected. */
export function parseMoneyInput(
  input: string,
): { ok: true; amountMinor: number } | { ok: false; error: string } {
  const parsed = parseAmountToMinor(input);
  return parsed.ok
    ? { ok: true, amountMinor: parsed.amountMinor }
    : { ok: false, error: parsed.error };
}

/** Parse a positive whole number of normal hours, or a message. */
export function parseHours(
  input: string,
): { ok: true; hours: number } | { ok: false; error: string } {
  const hours = Number(input);
  if (!Number.isFinite(hours) || hours <= 0) return { ok: false, error: t("attendance.errHours") };
  return { ok: true, hours };
}
