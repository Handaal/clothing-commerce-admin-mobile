// Persistence seam for the last-selected tenant. This is a UX convenience only and is NEVER trusted
// as authoritative — every bootstrap re-validates it against the server's live memberships.

export interface TenantStorage {
  readSelectedTenantId(): Promise<string | null>;
  writeSelectedTenantId(tenantId: string): Promise<void>;
  clearSelectedTenantId(): Promise<void>;
}

/** In-memory implementation used by tests and as a safe fallback where secure storage is absent. */
export function createMemoryTenantStorage(initial: string | null = null): TenantStorage {
  let value = initial;
  return {
    readSelectedTenantId: async () => value,
    writeSelectedTenantId: async (tenantId: string) => {
      value = tenantId;
    },
    clearSelectedTenantId: async () => {
      value = null;
    },
  };
}
