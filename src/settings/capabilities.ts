import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

export interface SettingsCapabilities {
  canRead: boolean;
  canManage: boolean;
}

/**
 * SDK 0.13.1 does not type Settings guidance. Read the frozen additive shape defensively until
 * SDK 0.14.0 owns it. Missing, malformed, or partial guidance is denied.
 */
export function settingsCapabilities(context: MeContextResponse): SettingsCapabilities {
  const access: unknown = context.access;
  if (!isRecord(access)) return { canRead: false, canManage: false };
  const settings = access.settings;
  if (!isRecord(settings)) return { canRead: false, canManage: false };
  return {
    canRead: settings.canRead === true,
    canManage: settings.canManage === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
