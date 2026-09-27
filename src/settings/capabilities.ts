import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

export interface SettingsCapabilities {
  canRead: boolean;
  canManage: boolean;
}

export function settingsCapabilities(context: MeContextResponse): SettingsCapabilities {
  const settings = context.access.settings;
  if (!settings) return { canRead: false, canManage: false };
  return {
    canRead: settings.canRead,
    canManage: settings.canManage,
  };
}
