import * as Crypto from "expo-crypto";

/**
 * Factory for inventory-write idempotency keys. A key identifies ONE logical write intent: the same
 * key is reused verbatim across ambiguous-network retries so the API applies the operation at most
 * once, and a brand-new key is minted only when a genuinely new operation begins (see {@link
 * ../ui/useMutation.useMutation}).
 *
 * It is a plain function behind a type so tests can inject a deterministic sequence; production wiring
 * uses {@link secureIdempotencyKey}. Keys must NEVER be derived from render state, timestamps, counters,
 * or `Math.random` — a predictable or render-regenerated key defeats idempotency.
 */
export type IdempotencyKeyFactory = () => string;

/**
 * Secure default: an RFC-4122 v4 UUID from the platform CSPRNG via `expo-crypto` (native SecRandom /
 * Web Crypto under Expo web), which is already part of the supported Expo runtime. Each call returns a
 * fresh, unpredictable key.
 */
export const secureIdempotencyKey: IdempotencyKeyFactory = () => Crypto.randomUUID();
