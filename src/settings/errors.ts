import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";

export type SettingsErrorKind =
  "forbidden" | "validation" | "immutable" | "historical-lock" | "conflict" | "network" | "server";

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
    if (error.status === 403)
      return message("forbidden", "Access denied", "You are not allowed to make this change.");
    if (error.status >= 500)
      return message(
        "server",
        "Settings unavailable",
        "The service could not complete the request.",
      );
    if (error.status === 409) {
      if (/currency|history|sales/i.test(error.message)) {
        return message(
          "historical-lock",
          "Change restricted",
          "This value cannot be changed after commercial history exists.",
        );
      }
      return message("conflict", "Conflicting change", "Refresh the settings and try again.");
    }
    if (/immutable/i.test(error.message)) {
      return message(
        "immutable",
        "Field is read-only",
        "This field cannot be changed after creation.",
      );
    }
    if (error.status === 400 || error.status === 422) {
      return message(
        "validation",
        "Check the details",
        "Review the highlighted settings and try again.",
      );
    }
  }
  return message("server", "Settings unavailable", "The service could not complete the request.");
}

function message(kind: SettingsErrorKind, heading: string, text: string): SettingsErrorMessage {
  return { kind, heading, message: text };
}
