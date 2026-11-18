import { ApiContractError, ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";

import { t } from "../i18n";

// Distinct failure categories. Failures are surfaced as errors — they are NEVER converted into fake
// successful or empty states, and there is no mock-data fallback.
//
// `message` is shown to shop owners and managers, who are not developers: it is always plain language
// (localized) and never mentions HTTP status codes, "the API", "the server" or other technical terms.
// The technical facts stay on `status` / `code` / `requestId` for logging and recovery decisions.
export type CommerceErrorKind =
  | "auth" // 401 — signed out / session expired
  | "forbidden" // 403 — signed in, but this account may not do this
  | "not-found" // 404 — the item does not exist (or is not visible)
  | "validation" // 400/422 — the entered details were rejected
  | "network" // no connection
  | "contract" // the response could not be understood
  | "server" // unexpected failure on the service side (5xx / other HTTP error)
  | "unknown"; // anything we could not classify

export interface ClassifiedCommerceError {
  kind: CommerceErrorKind;
  message: string;
  status?: number;
  code?: string;
  requestId?: string | null;
}

export function classifyCommerceError(error: unknown): ClassifiedCommerceError {
  if (error instanceof ApiHttpError) {
    const base = {
      status: error.status,
      code: error.code,
      requestId: error.requestId,
    };
    if (error.status === 401) return { kind: "auth", message: t("err.session"), ...base };
    if (error.status === 403) return { kind: "forbidden", message: t("err.forbidden"), ...base };
    if (error.status === 404) return { kind: "not-found", message: t("err.notFound"), ...base };
    if (error.status === 400 || error.status === 422) {
      return { kind: "validation", message: t("err.validation"), ...base };
    }
    return { kind: "server", message: t("err.server"), ...base };
  }

  if (error instanceof ApiNetworkError) return { kind: "network", message: t("err.network") };
  if (error instanceof ApiContractError) return { kind: "contract", message: t("err.unknown") };
  return { kind: "unknown", message: t("err.unknown") };
}
