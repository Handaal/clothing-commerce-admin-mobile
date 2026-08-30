// Public runtime configuration embedded into the Admin Mobile bundle.
//
// Only EXPO_PUBLIC_* values are read here. These are compiled into the client and are NOT secrets.
// Server secrets (service-role keys, Clerk secret keys, webhook signing secrets) must never be read
// by the mobile app and must never use the EXPO_PUBLIC_ prefix.

/**
 * The Commerce API base URL the SDK talks to.
 *
 * There is intentionally no localhost/mock fallback: a missing URL fails loudly so the app can never
 * silently serve fake or local data in place of the authoritative Commerce API.
 */
export function getCommerceApiBaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_COMMERCE_API_URL?.trim();
  if (!value) {
    throw new Error(
      "EXPO_PUBLIC_COMMERCE_API_URL is not configured. Admin Mobile will not start without a real " +
        "Commerce API URL and never falls back to mock or local data. Set it in your .env file.",
    );
  }
  return value;
}

/**
 * Clerk's Expo publishable key. Public by design (safe to embed). Returns undefined when unset so the
 * UI can render an explicit configuration notice instead of crashing deep inside Clerk.
 */
export function getClerkPublishableKey(): string | undefined {
  return process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || undefined;
}
