import * as SecureStore from "expo-secure-store";

import { createMemoryTenantStorage, type TenantStorage } from "./storage";

const SELECTED_TENANT_KEY = "admin-mobile.selected-tenant-id";

/**
 * Device-backed tenant storage using expo-secure-store on native. Because the persisted value is a
 * non-authoritative UX hint (re-validated against the server on every bootstrap), any storage
 * failure degrades safely to an in-process value rather than blocking sign-in. On platforms without
 * SecureStore (e.g. web), the in-memory fallback is used.
 */
export function createSecureTenantStorage(): TenantStorage {
  const fallback = createMemoryTenantStorage();

  return {
    readSelectedTenantId: async () => {
      try {
        return await SecureStore.getItemAsync(SELECTED_TENANT_KEY);
      } catch {
        return fallback.readSelectedTenantId();
      }
    },
    writeSelectedTenantId: async (tenantId: string) => {
      try {
        await SecureStore.setItemAsync(SELECTED_TENANT_KEY, tenantId);
      } catch {
        await fallback.writeSelectedTenantId(tenantId);
      }
    },
    clearSelectedTenantId: async () => {
      try {
        await SecureStore.deleteItemAsync(SELECTED_TENANT_KEY);
      } catch {
        await fallback.clearSelectedTenantId();
      }
    },
  };
}
