import { tokenCache } from "@clerk/expo/token-cache";

// Clerk stores the active session token in memory by default. This is Clerk's official Expo secure
// token cache (backed by expo-secure-store) so the session survives app restarts on device. It is
// intentionally `undefined` on web, where Clerk manages its own browser storage.
export const clerkTokenCache = tokenCache;
