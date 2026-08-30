import {
  createCommerceClient,
  type CommerceClient,
  type TokenProvider,
} from "@shifted/clothing-commerce-sdk";

import { ADMIN_MOBILE_CLIENT } from "../config/client-metadata";
import { getCommerceApiBaseUrl } from "../config/env";

export interface ConfiguredCommerceClientParams {
  /**
   * Token callback supplied by the Mobile auth layer (Clerk). The Commerce SDK stays Clerk-agnostic:
   * it only ever receives this function and never a Clerk object or session.
   */
  getToken: TokenProvider;
  /** Override for tests only. Production resolves the URL from EXPO_PUBLIC_COMMERCE_API_URL. */
  baseUrl?: string;
  /** Override for tests only. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Builds the single Commerce SDK client for the app. This is the ONLY place a Commerce client is
 * constructed — there is no hand-rolled fetch client duplicating the SDK, and Authorization,
 * X-Client-*, and X-Tenant-Id headers are all owned by the SDK.
 */
export function createConfiguredCommerceClient({
  getToken,
  baseUrl,
  fetch,
}: ConfiguredCommerceClientParams): CommerceClient {
  return createCommerceClient({
    baseUrl: baseUrl ?? getCommerceApiBaseUrl(),
    client: ADMIN_MOBILE_CLIENT,
    getToken,
    fetch,
  });
}
