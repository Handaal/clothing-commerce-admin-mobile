import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

export interface ReportingCapabilities {
  canRead: boolean;
}

/** Missing or false guidance is denied. The API still authorizes every report request. */
export function reportingCapabilities(context: MeContextResponse): ReportingCapabilities {
  return { canRead: context.access.reports?.canRead === true };
}
