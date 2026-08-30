import { describe, expect, it } from "vitest";

import { TENANT_A, TENANT_B, MEMBERSHIP_A, MEMBERSHIP_B, tenant } from "../test-support/fixtures";
import { resolveTenantSelection } from "./selection";

describe("resolveTenantSelection", () => {
  it("zero tenants → no-access state (never fabricates a tenant)", () => {
    const result = resolveTenantSelection([], null);
    expect(result.kind).toBe("no-tenants");
    expect(result.selectedTenantId).toBeNull();
  });

  it("exactly one tenant → auto-selected", () => {
    const result = resolveTenantSelection([tenant(TENANT_A, "Acme", MEMBERSHIP_A)], null);
    expect(result.kind).toBe("auto-selected");
    expect(result.selectedTenantId).toBe(TENANT_A);
    expect(result.reusedPersisted).toBe(false);
  });

  it("multiple tenants with no persisted choice → selection required", () => {
    const result = resolveTenantSelection(
      [tenant(TENANT_A, "Acme", MEMBERSHIP_A), tenant(TENANT_B, "Beta", MEMBERSHIP_B)],
      null,
    );
    expect(result.kind).toBe("selection-required");
    expect(result.selectedTenantId).toBeNull();
  });

  it("persisted tenant still present → reused", () => {
    const result = resolveTenantSelection(
      [tenant(TENANT_A, "Acme", MEMBERSHIP_A), tenant(TENANT_B, "Beta", MEMBERSHIP_B)],
      TENANT_B,
    );
    expect(result.kind).toBe("auto-selected");
    expect(result.selectedTenantId).toBe(TENANT_B);
    expect(result.reusedPersisted).toBe(true);
  });

  it("stale persisted tenant (no longer a member) → rejected", () => {
    const result = resolveTenantSelection(
      [tenant(TENANT_A, "Acme", MEMBERSHIP_A), tenant(TENANT_B, "Beta", MEMBERSHIP_B)],
      "99999999-9999-4999-8999-999999999999",
    );
    expect(result.kind).toBe("selection-required");
    expect(result.selectedTenantId).toBeNull();
    expect(result.reusedPersisted).toBe(false);
  });
});
