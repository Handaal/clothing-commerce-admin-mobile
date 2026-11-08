import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";

import { t } from "../i18n";

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
    return message("network", t("set.errNetwork"), t("set.errNetworkMsg"));
  }
  if (error instanceof ApiHttpError) {
    if (error.status === 401 || error.status === 403)
      return message("forbidden", t("errorHead.forbidden"), t("set.errForbiddenMsg"));
    if (error.status >= 500) return message("server", t("set.unavailable"), t("set.errServerMsg"));
    if (error.status === 409) {
      // Operational-topology conflicts raised by the Settings write boundary (API SDK 0.14.0+). These
      // mirror the same rules public checkout and POS enforce; the UI only maps them to guidance and
      // never restates the server rule. See docs/settings/operational-settings-core.md.
      if (error.code === "STOREFRONT_LOCATION_NOT_OPERATIONAL") {
        return message(
          "topology-conflict",
          t("set.errStorefrontLoc"),
          t("set.errStorefrontLocMsg"),
        );
      }
      if (error.code === "REGISTER_LOCATION_NOT_OPERATIONAL") {
        return message("topology-conflict", t("set.errRegisterLoc"), t("set.errRegisterLocMsg"));
      }
      if (error.code === "STOREFRONT_DEPENDENCY_CONFLICT") {
        return message(
          "topology-conflict",
          t("set.errStorefrontDep"),
          t("set.errStorefrontDepMsg"),
        );
      }
      if (error.code === "REGISTER_DEPENDENCY_CONFLICT") {
        return message("topology-conflict", t("set.errRegisterDep"), t("set.errRegisterDepMsg"));
      }
      if (error.code === "CURRENCY_LOCKED" || /currency|history|sales/i.test(error.message)) {
        return message(
          "historical-lock",
          t("set.errCurrencyLocked"),
          t("set.errCurrencyLockedMsg"),
        );
      }
      if (error.code === "IMMUTABLE_FIELD" || /immutable/i.test(error.message)) {
        return message("immutable", t("set.errImmutable"), t("set.errImmutableMsg"));
      }
      if (error.code === "DEVICE_CONFLICT") {
        return message(
          "device-conflict",
          t("set.errDeviceConflict"),
          t("set.errDeviceConflictMsg"),
        );
      }
      if (error.code === "IDEMPOTENCY_CONFLICT") {
        return message("idempotency-conflict", t("set.errIdempotency"), t("set.errIdempotencyMsg"));
      }
      if (error.code === "SETTINGS_CODE_CONFLICT") {
        return message("conflict", t("set.errCodeConflict"), t("set.errCodeConflictMsg"));
      }
      if (/lifecycle|status|active/i.test(error.message)) {
        return message("lifecycle-conflict", t("set.errLifecycle"), t("set.errLifecycleMsg"));
      }
      return message("conflict", t("set.errConflict"), t("set.errConflictMsg"));
    }
    if (error.status === 400 || error.status === 422) {
      return message("validation", t("set.errValidation"), t("set.errValidationMsg"));
    }
  }
  return message("server", t("set.unavailable"), t("set.errServerMsg"));
}

function message(kind: SettingsErrorKind, heading: string, text: string): SettingsErrorMessage {
  return { kind, heading, message: text };
}
