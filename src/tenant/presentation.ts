// Local client-preview naming only. Tenant IDs, membership, authorization and API requests continue
// to use the authoritative Commerce API values; this affects presentation text only.
const LOCAL_PREVIEW_TENANT = "dev local";
const DEFAULT_LOCAL_PREVIEW_NAME = "Zee Store";

function normalizedTenantName(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

export function tenantDisplayName(
  authoritativeName: string,
  previewName = process.env.EXPO_PUBLIC_PREVIEW_STORE_NAME || DEFAULT_LOCAL_PREVIEW_NAME,
): string {
  const configuredName = previewName?.trim();
  if (!configuredName || normalizedTenantName(authoritativeName) !== LOCAL_PREVIEW_TENANT) {
    return authoritativeName;
  }
  return configuredName;
}
