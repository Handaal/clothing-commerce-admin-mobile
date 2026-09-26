import type { MeContextResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";

import { resolveSettingsAdapter } from "./adapter";
import { settingsCapabilities } from "./capabilities";

export function settingsRouteState(context: MeContextResponse, client: TenantCommerceClient) {
  return { ...settingsCapabilities(context), adapter: resolveSettingsAdapter(client) };
}
