import type { ClientMetadata } from "@shifted/clothing-commerce-sdk";

// Identifies this application to the Commerce API through the SDK-owned X-Client-Type and
// X-Client-Version headers. The version tracks the Admin Mobile *application* release (see app.json
// "version"), not the SDK version, so the API can reason about client capabilities independently.
export const ADMIN_MOBILE_CLIENT_TYPE = "admin-mobile" as const;
export const ADMIN_MOBILE_CLIENT_VERSION = "0.1.0";

export const ADMIN_MOBILE_CLIENT: ClientMetadata = {
  type: ADMIN_MOBILE_CLIENT_TYPE,
  version: ADMIN_MOBILE_CLIENT_VERSION,
};
