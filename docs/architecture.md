# Admin Mobile Architecture

```text
Clerk (auth, owned by Mobile)
  │  getToken callback (token only — never a Clerk object)
  ▼
@shifted/clothing-commerce-sdk 0.2.0  (packed tarball under vendor/, relative file: path)
  │  owns Authorization, X-Client-Type/Version, X-Tenant-Id
  ▼
Commerce API  →  authoritative commerce core
```

The app is exclusively a management channel. Identity and UI visibility support usability, but the
API performs authoritative authorization, tenant isolation, validation, and business rules.
Sensitive actions should generally require connectivity.

This repository has no POS flow, hardware integration, independent inventory, Supabase directory,
database migration ownership, or privileged database credential. It never imports the Commerce API's
source, schemas, or contracts, and never links to a sibling API checkout — it consumes the API only
through the vendored, versioned SDK.

## Module map (Checkpoint 1)

| Concern                | Module                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| Public config          | `src/config/env.ts`, `src/config/client-metadata.ts`               |
| Clerk provider + cache | `app/_layout.tsx`, `src/auth/token-cache.ts`                       |
| Commerce SDK boundary  | `src/commerce/client.ts` (getToken), `src/commerce/errors.ts`      |
| Tenant policy (pure)   | `src/tenant/selection.ts`                                          |
| Tenant bootstrap       | `src/tenant/bootstrap.ts`, `src/tenant/{storage,secure-storage}`   |
| Session state machine  | `src/session/reducer.ts` (pure), `src/session/SessionProvider.tsx` |
| Checkpoint UI          | `app/index.tsx`, `src/ui/*`                                        |

## Boundary invariants

1. The Commerce SDK is Clerk-agnostic — it receives only a `getToken` callback.
2. The SDK owns all auth/tenant/client headers; the app never hand-writes them.
3. Tenant-scoped calls (`/me/context`, and future resources) are reachable only via
   `client.withTenant(tenantId)`, so they cannot run before tenant resolution.
4. Persisted tenant selection is re-validated against `/me/tenants` on every bootstrap; the server is
   authoritative.
5. Failures surface as typed errors — never mock data or fake-empty states.
6. No `EXPO_PUBLIC_` value is a secret; a missing API URL fails loudly.
