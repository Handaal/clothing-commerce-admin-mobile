import { createCommerceClient } from "@shifted/clothing-commerce-sdk";

import { ADMIN_MOBILE_CLIENT } from "./config/client-metadata";
import { getCommerceApiBaseUrl } from "./config/env";

export type ApiStatus = "connected" | "unavailable";

export interface GetApiStatusOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Unauthenticated Commerce API health probe via the SDK. Used for connectivity diagnostics only; it
 * requires no token or tenant. The base URL comes from EXPO_PUBLIC_COMMERCE_API_URL (no mock/local
 * fallback) unless explicitly overridden for tests.
 */
export async function getApiStatus({
  baseUrl = getCommerceApiBaseUrl(),
  fetch,
}: GetApiStatusOptions = {}): Promise<ApiStatus> {
  const client = createCommerceClient({
    baseUrl,
    client: ADMIN_MOBILE_CLIENT,
    fetch,
  });

  try {
    await client.getHealth();
    return "connected";
  } catch {
    return "unavailable";
  }
}
