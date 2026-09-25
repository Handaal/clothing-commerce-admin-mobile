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
