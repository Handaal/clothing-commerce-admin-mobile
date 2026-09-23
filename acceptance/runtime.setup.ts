// The runtime acceptance suites import REAL Expo modules (e.g. `expo-crypto` for idempotency keys) rather
// than mocking them, so the app runs exactly as in production. Metro normally injects the `__DEV__` global
// at build time; under vitest it is absent, and `expo-modules-core` dereferences it at import, throwing a
// ReferenceError before any test runs. Define it here (false = production-like) so the real modules load.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

export {};
