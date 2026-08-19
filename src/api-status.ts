import { createCommerceClient } from "@shifted/clothing-commerce-sdk";

export type ApiStatus = "connected" | "unavailable";

export interface GetApiStatusOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export async function getApiStatus({
  baseUrl = process.env.EXPO_PUBLIC_COMMERCE_API_URL ?? "http://localhost:3000",
  fetch,
}: GetApiStatusOptions = {}): Promise<ApiStatus> {
  const client = createCommerceClient({
    baseUrl,
    client: { type: "admin-mobile", version: "0.1.0" },
    fetch,
  });

  try {
    await client.getHealth();
    return "connected";
  } catch {
    return "unavailable";
  }
}
