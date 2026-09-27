import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";

export type SettingsErrorKind =
  | "forbidden"
  | "validation"
  | "immutable"
  | "historical-lock"
  | "lifecycle-conflict"
  | "topology-conflict"
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
      // Operational-topology conflicts raised by the Settings write boundary (API SDK 0.14.0+). These
      // mirror the same rules public checkout and POS enforce; the UI only maps them to guidance and
      // never restates the server rule. See docs/settings/operational-settings-core.md.
      if (error.code === "STOREFRONT_LOCATION_NOT_OPERATIONAL") {
        return message(
          "topology-conflict",
          "Storefront location not ready",
          "Enabling cash-on-delivery needs an active inventory location that is sellable and fulfillment-enabled, under an active brand. Choose or activate a suitable location first.",
        );
      }
      if (error.code === "REGISTER_LOCATION_NOT_OPERATIONAL") {
        return message(
          "topology-conflict",
          "Register location not ready",
          "Activating a register needs an active branch and an active, fulfillment-enabled default inventory location. Fix the location or branch first.",
        );
      }
      if (error.code === "STOREFRONT_DEPENDENCY_CONFLICT") {
        return message(
          "topology-conflict",
          "In use by an enabled storefront",
          "This brand or location is required by an enabled storefront. Disable or reroute the storefront before deactivating it or removing its sellable/fulfillment capability.",
        );
      }
      if (error.code === "REGISTER_DEPENDENCY_CONFLICT") {
        return message(
          "topology-conflict",
          "In use by an active register",
          "This branch or location is required by an active register. Deactivate the register before deactivating it or removing its fulfillment capability.",
        );
      }
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
