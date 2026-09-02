import { describe, expect, it } from "vitest";

import {
  MEMBERSHIP_A,
  TENANT_A,
  TENANT_B,
  MEMBERSHIP_B,
  meContext,
  tenant,
} from "../test-support/fixtures";
import { initialSessionState, sessionReducer, type SessionState } from "./reducer";

describe("sessionReducer", () => {
  it("routes zero-tenant resolution to the no-access phase", () => {
    const next = sessionReducer(initialSessionState, {
      type: "resolved",
      resolution: {
        kind: "no-tenants",
        tenants: [],
        selectedTenantId: null,
        reusedPersisted: false,
      },
    });
    expect(next.phase).toBe("no-access");
  });

  it("routes an auto-selected resolution into loading the tenant context", () => {
    const next = sessionReducer(initialSessionState, {
      type: "resolved",
      resolution: {
        kind: "auto-selected",
        tenants: [tenant(TENANT_A, "Acme", MEMBERSHIP_A)],
        selectedTenantId: TENANT_A,
        reusedPersisted: false,
      },
    });
    expect(next).toMatchObject({ phase: "loading-context", tenantId: TENANT_A });
  });

  it("routes a multi-tenant resolution to the chooser", () => {
    const next = sessionReducer(initialSessionState, {
      type: "resolved",
      resolution: {
        kind: "selection-required",
        tenants: [tenant(TENANT_A, "Acme", MEMBERSHIP_A), tenant(TENANT_B, "Beta", MEMBERSHIP_B)],
        selectedTenantId: null,
        reusedPersisted: false,
      },
    });
    expect(next.phase).toBe("choosing");
  });

  it("sign-out hard-resets tenant, context, and error state", () => {
    const ready: SessionState = {
      phase: "ready",
      tenantId: TENANT_A,
      tenants: [tenant(TENANT_A, "Acme", MEMBERSHIP_A)],
      context: meContext(TENANT_A),
    };
    const next = sessionReducer(ready, { type: "signed-out" });
    expect(next).toEqual({ phase: "signed-out" });
  });
});
