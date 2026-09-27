import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";

export type SettingsErrorKind =
  | "forbidden"
  | "validation"
  | "immutable"
  | "historical-lock"
  | "lifecycle-conflict"
  | "device-conflict"
  | "idempotency-conflict"
  | "conflict"
  | "network"
  | "server";

export interface SettingsErrorMessage {
  kind: SettingsErrorKind;
  heading: string;
  message: string;
}

/** Concise presentation mapping; raw backend codes are deliberately never returned to the UI. */
export function describeSettingsError(error: unknown): SettingsErrorMessage {
  if (error instanceof ApiNetworkError) {
    return message("network", "Connection problem", "Check your connection and try again.");
  }
  if (error instanceof ApiHttpError) {
    if (error.status === 401 || error.status === 403)
      return message("forbidden", "Access denied", "You are not allowed to make this change.");
    if (error.status >= 500)
      return message(
        "server",
        "Settings unavailable",
        "The service could not complete the request.",
      );
    if (error.status === 409) {
      if (error.code === "CURRENCY_LOCKED" || /currency|history|sales/i.test(error.message)) {
        return message(
          "historical-lock",
          "Change restricted",
          "This value cannot be changed after commercial history exists.",
        );
      }
      if (error.code === "IMMUTABLE_FIELD" || /immutable/i.test(error.message)) {
        return message(
          "immutable",
          "Field is read-only",
          "Codes, parents, location types, and Register Branches cannot change after creation.",
        );
      }
      if (error.code === "DEVICE_CONFLICT") {
        return message(
          "device-conflict",
          "Device assignment changed",
          "Refresh the Device and Register state, then try again.",
        );
      }
      if (error.code === "IDEMPOTENCY_CONFLICT") {
        return message(
          "idempotency-conflict",
          "Request conflict",
          "This retry no longer matches the original change. Review the settings and submit again.",
        );
      }
      if (error.code === "SETTINGS_CODE_CONFLICT") {
        return message("conflict", "Code already used", "Choose a different unique code.");
      }
      if (/lifecycle|status|active/i.test(error.message)) {
        return message(
          "lifecycle-conflict",
          "Lifecycle change blocked",
          "Refresh the record and review its current operational dependencies.",
        );
      }
      return message("conflict", "Conflicting change", "Refresh the settings and try again.");
    }
    if (error.status === 400 || error.status === 422) {
      return message(
        "validation",
        "Check the details",
        "Review the values and relationships. Default locations must belong to the same Branch, and an InventoryLocation must have exactly one parent.",
      );
    }
  }
  return message("server", "Settings unavailable", "The service could not complete the request.");
}

function message(kind: SettingsErrorKind, heading: string, text: string): SettingsErrorMessage {
  return { kind, heading, message: text };
}
