import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";

import type { ClassifiedCommerceError } from "../commerce/errors";
import type { TenantMembership, TenantResolution } from "../tenant/selection";

// The authenticated-session state machine, kept pure so its transitions (including the sign-out
// reset) are unit-testable without React, Clerk, or native modules.
export type SessionState =
  | { phase: "initializing" } // waiting for Clerk to load
  | { phase: "signed-out" }
  | { phase: "bootstrapping" } // calling /me/tenants
  | { phase: "no-access" } // authenticated but zero active tenants
  | { phase: "choosing"; tenants: TenantMembership[] } // multiple tenants, awaiting choice
  | { phase: "loading-context"; tenantId: string; tenants: TenantMembership[] }
  | { phase: "ready"; tenantId: string; tenants: TenantMembership[]; context: MeContextResponse }
  | { phase: "error"; error: ClassifiedCommerceError };

export type SessionAction =
  | { type: "clerk-loading" }
  | { type: "signed-out" }
  | { type: "bootstrap-start" }
  | { type: "resolved"; resolution: TenantResolution }
  | { type: "context-loading"; tenantId: string; tenants: TenantMembership[] }
  | {
      type: "context-loaded";
      tenantId: string;
      tenants: TenantMembership[];
      context: MeContextResponse;
    }
  | { type: "failed"; error: ClassifiedCommerceError };

export const initialSessionState: SessionState = { phase: "initializing" };

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "clerk-loading":
      return { phase: "initializing" };

    case "signed-out":
      // Hard reset: no tenant, context, or error state survives sign-out.
      return { phase: "signed-out" };

    case "bootstrap-start":
      return { phase: "bootstrapping" };

    case "resolved": {
      const { resolution } = action;
      if (resolution.kind === "no-tenants") {
        return { phase: "no-access" };
      }
      if (resolution.kind === "selection-required") {
        return { phase: "choosing", tenants: resolution.tenants };
      }
      // auto-selected
      return {
        phase: "loading-context",
        tenantId: resolution.selectedTenantId as string,
        tenants: resolution.tenants,
      };
    }

    case "context-loading":
      return { phase: "loading-context", tenantId: action.tenantId, tenants: action.tenants };

    case "context-loaded":
      return {
        phase: "ready",
        tenantId: action.tenantId,
        tenants: action.tenants,
        context: action.context,
      };

    case "failed":
      return { phase: "error", error: action.error };

    default:
      return state;
  }
}
