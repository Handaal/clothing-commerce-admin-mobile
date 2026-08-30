import { createCommerceClient } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it, vi } from "vitest";

import { createConfiguredCommerceClient } from "../commerce/client";
import {
  MEMBERSHIP_A,
  MEMBERSHIP_B,
  TENANT_A,
  TENANT_B,
  meContext,
  recordingFetch,
  tenant,
  type RecordedRequest,
} from "../test-support/fixtures";
import { bootstrapTenants, loadTenantContext } from "./bootstrap";
import { createMemoryTenantStorage } from "./storage";

const BASE = "https://api.example.test";

describe("bootstrapTenants persistence reconciliation", () => {
  it("keeps a still-valid persisted tenant (reused, not rewritten)", async () => {
    const recorded: RecordedRequest[] = [];
    const client = createCommerceClient({
      baseUrl: BASE,
      fetch: recordingFetch(
        [tenant(TENANT_A, "Acme", MEMBERSHIP_A), tenant(TENANT_B, "Beta", MEMBERSHIP_B)],
        recorded,
      ),
    });
    const storage = createMemoryTenantStorage(TENANT_B);
    const writeSpy = vi.spyOn(storage, "writeSelectedTenantId");

    const resolution = await bootstrapTenants({ client, storage });

    expect(resolution.selectedTenantId).toBe(TENANT_B);
    expect(resolution.reusedPersisted).toBe(true);
    expect(writeSpy).not.toHaveBeenCalled();
    expect(await storage.readSelectedTenantId()).toBe(TENANT_B);
  });

  it("discards a stale persisted tenant that is no longer a membership", async () => {
    const recorded: RecordedRequest[] = [];
    const client = createCommerceClient({
      baseUrl: BASE,
      fetch: recordingFetch(
        [tenant(TENANT_A, "Acme", MEMBERSHIP_A), tenant(TENANT_B, "Beta", MEMBERSHIP_B)],
        recorded,
      ),
    });
    const storage = createMemoryTenantStorage("99999999-9999-4999-8999-999999999999");

    const resolution = await bootstrapTenants({ client, storage });

    expect(resolution.kind).toBe("selection-required");
    expect(await storage.readSelectedTenantId()).toBeNull();
  });

  it("does not request X-Tenant-Id when listing tenants", async () => {
    const recorded: RecordedRequest[] = [];
    const client = createCommerceClient({
      baseUrl: BASE,
      fetch: recordingFetch([tenant(TENANT_A, "Acme", MEMBERSHIP_A)], recorded),
    });
    await bootstrapTenants({ client, storage: createMemoryTenantStorage() });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].url).toContain("/api/v1/me/tenants");
    expect(recorded[0].headers["X-Tenant-Id"]).toBeUndefined();
  });

  it("propagates API failures instead of returning an empty tenant list (no mock fallback)", async () => {
    const client = createCommerceClient({
      baseUrl: BASE,
      fetch: (async () => {
        throw new Error("offline");
      }) as unknown as typeof globalThis.fetch,
    });
    const storage = createMemoryTenantStorage(TENANT_A);

    await expect(bootstrapTenants({ client, storage })).rejects.toBeTruthy();
    // The persisted value is untouched because we never reached reconciliation.
    expect(await storage.readSelectedTenantId()).toBe(TENANT_A);
  });
});

describe("tenant-scoped context boundary", () => {
  it("context is only reachable via withTenant — the base client cannot fetch context", () => {
    const client = createConfiguredCommerceClient({ getToken: async () => "t", baseUrl: BASE });
    expect((client as unknown as { getContext?: unknown }).getContext).toBeUndefined();
    expect(typeof client.getMyTenants).toBe("function");
    expect(typeof client.withTenant).toBe("function");
    expect(typeof client.withTenant(TENANT_A).getContext).toBe("function");
  });

  it("loadTenantContext hits /me/context with the SDK-injected X-Tenant-Id", async () => {
    const recorded: RecordedRequest[] = [];
    const client = createCommerceClient({
      baseUrl: BASE,
      fetch: recordingFetch(meContext(TENANT_A), recorded),
    });

    const context = await loadTenantContext(client, TENANT_A);

    expect(context.tenant.id).toBe(TENANT_A);
    expect(recorded).toHaveLength(1);
    expect(recorded[0].url).toContain("/api/v1/me/context");
    expect(recorded[0].headers["X-Tenant-Id"]).toBe(TENANT_A);
  });
});
