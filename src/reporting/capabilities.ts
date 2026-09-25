import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

export interface ReportingCapabilities {
  canRead: boolean;
}

/**
 * Isolates the one future context addition without widening the SDK contract throughout the app.
 * Missing, malformed, or false guidance is denied. This reads no permission strings and never grants
 * authorization; the eventual API call must still enforce reports.read.
 */
export function reportingCapabilities(context: MeContextResponse): ReportingCapabilities {
  const access = context.access as MeContextResponse["access"] & {
    reports?: { canRead?: unknown };
  };
  return { canRead: access.reports?.canRead === true };
}
