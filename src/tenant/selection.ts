import type { MeTenantsResponse } from "@shifted/clothing-commerce-sdk";

export type TenantMembership = MeTenantsResponse[number];

export type TenantResolutionKind =
  | "no-tenants" // caller has zero selectable tenants → explicit no-access state
  | "auto-selected" // exactly one tenant, or a still-valid persisted choice → selected automatically
  | "selection-required"; // multiple tenants and no valid persisted choice → user must choose

export interface TenantResolution {
  kind: TenantResolutionKind;
  tenants: TenantMembership[];
  selectedTenantId: string | null;
  /** True only when a previously persisted tenant was found valid and reused. */
  reusedPersisted: boolean;
}

/**
 * Pure tenant-selection policy. The server's returned memberships are authoritative; a persisted
 * tenant id is only ever honoured when it still appears in that list.
 *
 * - zero tenants               → no-tenants (never fabricate one)
 * - persisted id still present → auto-selected, reused
 * - exactly one tenant         → auto-selected
 * - otherwise (many, no valid) → selection-required
 */
export function resolveTenantSelection(
  tenants: TenantMembership[],
  persistedTenantId: string | null,
): TenantResolution {
  if (tenants.length === 0) {
    return { kind: "no-tenants", tenants, selectedTenantId: null, reusedPersisted: false };
  }

  const persistedIsValid =
    persistedTenantId != null && tenants.some((tenant) => tenant.tenantId === persistedTenantId);

  if (persistedIsValid) {
    return {
      kind: "auto-selected",
      tenants,
      selectedTenantId: persistedTenantId,
      reusedPersisted: true,
    };
  }

  if (tenants.length === 1) {
    return {
      kind: "auto-selected",
      tenants,
      selectedTenantId: tenants[0].tenantId,
      reusedPersisted: false,
    };
  }

  return { kind: "selection-required", tenants, selectedTenantId: null, reusedPersisted: false };
}
