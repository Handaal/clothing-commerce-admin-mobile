import type { MeContextResponse, MeTenantsResponse } from "@shifted/clothing-commerce-sdk";

// Deterministic, schema-valid fixtures for the SDK contracts (UUIDs must be valid v4-shaped strings).
export const TENANT_A = "11111111-1111-4111-8111-111111111111";
export const TENANT_B = "22222222-2222-4222-8222-222222222222";
export const MEMBERSHIP_A = "33333333-3333-4333-8333-333333333333";
export const MEMBERSHIP_B = "44444444-4444-4444-8444-444444444444";

export function tenant(id: string, name: string, membershipId: string): MeTenantsResponse[number] {
  return { tenantId: id, tenantName: name, membershipId };
}

export function meContext(tenantId: string): MeContextResponse {
  return {
    tenant: { id: tenantId, name: "Acme Apparel", status: "active" },
    membership: { id: MEMBERSHIP_A },
    access: {
      catalog: { canRead: true, tenantWide: true, brands: [] },
      inventory: { canRead: false, tenantWide: false, locations: [] },
      orders: { canRead: true, tenantWide: false, brands: [], branches: [] },
    },
  };
}

export interface RecordedRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * A fetch stub that records requests and returns the given JSON body. Header capture works because
 * the SDK passes a plain object under `init.headers`.
 */
export function recordingFetch(
  body: unknown,
  recorded: RecordedRequest[],
  status = 200,
): typeof globalThis.fetch {
  return (async (url: string, init?: { headers?: Record<string, string> }) => {
    recorded.push({ url: String(url), headers: { ...(init?.headers ?? {}) } });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof globalThis.fetch;
}
