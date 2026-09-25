import type { ReportDateRange } from "./model";

export const DEFAULT_REPORT_RANGE: ReportDateRange = { preset: "today" };

const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateCustomDateRange(from: string, to: string): string | null {
  if (!LOCAL_DATE.test(from) || !LOCAL_DATE.test(to)) {
    return "Enter both dates as YYYY-MM-DD.";
  }
  if (from > to) return "Start date must be on or before end date.";
  return null;
}

export function customDateRange(from: string, to: string): ReportDateRange | null {
  return validateCustomDateRange(from, to) === null ? { preset: "custom", from, to } : null;
}

/** Resolves presets to calendar strings only. No UTC or business-day conversion occurs here. */
export function reportPeriodQuery(
  range: ReportDateRange,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  if (range.preset === "custom") {
    if (!range.from || !range.to || validateCustomDateRange(range.from, range.to) !== null) {
      throw new Error("Invalid custom reporting date range.");
    }
    return { startDate: range.from, endDate: range.to };
  }

  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  if (range.preset === "7-days") start.setDate(start.getDate() - 6);
  if (range.preset === "30-days") start.setDate(start.getDate() - 29);
  return { startDate: formatLocalCalendarDate(start), endDate: formatLocalCalendarDate(end) };
}

function formatLocalCalendarDate(value: Date): string {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}
