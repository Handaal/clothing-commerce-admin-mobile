import { ApiContractError, ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";

// Distinct, user-meaningful failure categories. Failures are surfaced as errors — they are NEVER
// converted into fake successful or empty states, and there is no mock-data fallback.
export type CommerceErrorKind =
  | "auth" // 401 — authentication/session problem
  | "forbidden" // 403 — authenticated but server-side authorization denied
  | "not-found" // 404 — the requested resource does not exist (or is not visible)
  | "validation" // 400/422 — request parameters, date range, or cursor were rejected
  | "network" // transport failure — Commerce API unreachable
  | "contract" // response violated the API contract
  | "server" // unexpected server-side failure (5xx / other HTTP error)
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
    if (error.status === 401) {
      return {
        kind: "auth",
        message: "Your session is invalid or has expired. Please sign in again.",
        ...base,
      };
    }
    if (error.status === 403) {
      return {
        kind: "forbidden",
        message: "You are signed in, but the server denied access to this resource.",
        ...base,
      };
    }
    if (error.status === 404) {
      return {
        kind: "not-found",
        message: "The requested item could not be found.",
        ...base,
      };
    }
    if (error.status === 400 || error.status === 422) {
      return {
        kind: "validation",
        message: "The request parameters were rejected. Review the input and try again.",
        ...base,
      };
    }
    return {
      kind: "server",
      message: `The Commerce API returned an unexpected error (HTTP ${error.status}).`,
      ...base,
    };
  }

  if (error instanceof ApiNetworkError) {
    return {
      kind: "network",
      message: "The Commerce API is unreachable. Check your connection and try again.",
    };
  }

  if (error instanceof ApiContractError) {
    return { kind: "contract", message: "The Commerce API returned data that failed validation." };
  }

  return { kind: "unknown", message: "An unexpected error occurred." };
}
