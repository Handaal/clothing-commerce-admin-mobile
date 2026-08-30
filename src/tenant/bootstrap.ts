import type { CommerceClient, MeContextResponse } from "@shifted/clothing-commerce-sdk";

import { resolveTenantSelection, type TenantResolution } from "./selection";
import type { TenantStorage } from "./storage";

export interface TenantBootstrapDeps {
  client: CommerceClient;
  storage: TenantStorage;
}

/**
 * Authenticated identity bootstrap.
 *
 * 1. Calls GET /api/v1/me/tenants via the SDK (no tenant context / no X-Tenant-Id).
 * 2. Reconciles any persisted selection against the live memberships (server is authoritative).
 * 3. Returns the resolved selection state (no-tenants / auto-selected / selection-required).
 *
 * Any SDK failure propagates to the caller — it is never swallowed into an empty tenant list.
 */
export async function bootstrapTenants({
  client,
  storage,
}: TenantBootstrapDeps): Promise<TenantResolution> {
  const tenants = await client.getMyTenants();
  const persisted = await storage.readSelectedTenantId();
  const resolution = resolveTenantSelection(tenants, persisted);
  await reconcilePersistedTenant(storage, persisted, resolution.selectedTenantId);
  return resolution;
}

async function reconcilePersistedTenant(
  storage: TenantStorage,
  persisted: string | null,
  selected: string | null,
): Promise<void> {
  if (selected === null) {
    // No selection resolved: discard any stale persisted value.
    if (persisted !== null) {
      await storage.clearSelectedTenantId();
    }
    return;
  }
  if (selected !== persisted) {
    await storage.writeSelectedTenantId(selected);
  }
}

/** Persists an explicit user tenant choice (multiple-tenant selector). */
export async function persistTenantSelection(
  storage: TenantStorage,
  tenantId: string,
): Promise<void> {
  await storage.writeSelectedTenantId(tenantId);
}

/**
 * Loads GET /api/v1/me/context for a resolved tenant. Context is ONLY reachable through the
 * SDK's tenant-scoped client (`withTenant`), so it is structurally impossible to request context
 * before a tenant has been resolved. The SDK owns the X-Tenant-Id header.
 */
export async function loadTenantContext(
  client: CommerceClient,
  tenantId: string,
): Promise<MeContextResponse> {
  return client.withTenant(tenantId).getContext();
}
