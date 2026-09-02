# Clothing Commerce Admin Mobile

Expo / React Native management-channel app for a clothing business's **authorized owners and
managers**. It is not a Shifted/platform super-admin app, not a POS/cashier app, not a
customer-shopping app, and not a website layout builder.

**Current scope — Phase 2F-B, Checkpoint 1.** This checkpoint establishes and proves the real
authentication + data boundary end to end:

```
Clerk sign-in → session token → @shifted/clothing-commerce-sdk (0.2.0)
  → GET /me/tenants → tenant selection → GET /me/context
```

There are intentionally **no** Products, Inventory, Orders, dashboard, reporting, or mutation
screens yet.

## Separate-repo architecture

This repository is fully standalone. It talks to the Commerce API **only** through a versioned,
packed SDK — never through the API's source, schemas, or a sibling checkout.

```
Admin Mobile (this repo)
  → @shifted/clothing-commerce-sdk  (packed tarball under vendor/)
    → Commerce API  (authoritative for identity, authorization, tenant isolation, data)
```

The Commerce API is authoritative for all business rules, authorization, tenant isolation, and
validation. Client-side visibility is UX only and is never treated as authorization.

## Vendored SDK

The exact packed SDK is committed under `vendor/` and referenced by a **relative** `file:` path, so
the app installs and builds with no sibling repos, workspace links, or private-registry access.

- Active SDK: `@shifted/clothing-commerce-sdk` **0.2.0**
- Artifact: `vendor/shifted-clothing-commerce-sdk-0.2.0.tgz`
- `package.json` dependency: `file:vendor/shifted-clothing-commerce-sdk-0.2.0.tgz`
- SHA-256: `764a5b756ff549e3dc01faf1d82f8bc6cb654cfd0889b2c7d7728afca59f6e3b`

### Verify the SDK artifact

```bash
# macOS/Linux
shasum -a 256 vendor/shifted-clothing-commerce-sdk-0.2.0.tgz
# Windows (PowerShell)
Get-FileHash vendor/shifted-clothing-commerce-sdk-0.2.0.tgz -Algorithm SHA256
```

The output must equal the SHA-256 above.

### Update the SDK artifact

1. Drop the new packed tarball into `vendor/` (e.g. `...-sdk-0.3.0.tgz`).
2. Point the dependency at it: `"@shifted/clothing-commerce-sdk": "file:vendor/shifted-clothing-commerce-sdk-0.3.0.tgz"`.
3. `pnpm install` to update `pnpm-lock.yaml`.
4. Update the SHA-256 above and in `src/sdk-artifact.test.ts` expectations, then remove the old
   tarball once nothing references it.
5. Run the full gate suite (below).

## Authentication (Clerk) — owned by Mobile

Clerk lives entirely in this app. It uses the supported Expo integration
(`@clerk/expo`, core-3 signals API) with Clerk's secure token cache
(`@clerk/expo/token-cache`, backed by `expo-secure-store`) so sessions persist across restarts on
device.

- `app/_layout.tsx` wraps the app in `ClerkProvider` (+ token cache) and `SessionProvider`.
- `src/ui/SignInScreen.tsx` performs a real email/password sign-in (`signIn.password` →
  `signIn.finalize`). It never simulates a signed-in state.

### Token-callback boundary

The Commerce SDK is **Clerk-agnostic**. It receives only a `getToken` callback and never a Clerk
object or session. Wiring lives in `src/session/SessionProvider.tsx` and
`src/commerce/client.ts`:

```ts
createConfiguredCommerceClient({ getToken: () => clerkGetToken() });
```

The SDK owns the `Authorization`, `X-Client-Type`/`X-Client-Version`, and `X-Tenant-Id` headers.
There is no hand-written Commerce client and no manual header duplication anywhere.

## Configuration

Copy `.env.example` to `.env` and set the **public** values (embedded in the app; none are secrets):

| Variable                            | Purpose                                                       |
| ----------------------------------- | ------------------------------------------------------------- |
| `EXPO_PUBLIC_COMMERCE_API_URL`      | Commerce API base URL. **Required** — no mock/local fallback. |
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (public, safe to embed).                |

Never place server secrets (Clerk secret key, service-role keys, webhook secrets) in this app or
under an `EXPO_PUBLIC_` name. A missing API URL fails loudly; a missing Clerk key renders an explicit
configuration notice.

## Tenant bootstrap

After Clerk authentication, `src/tenant/bootstrap.ts` calls `getMyTenants()`
(`GET /api/v1/me/tenants`, **without** `X-Tenant-Id`) and resolves selection
(`src/tenant/selection.ts`):

- **Zero tenants** → explicit no-active-business / no-access screen. No tenant is fabricated and the
  user does not silently enter the app.
- **Exactly one tenant** → auto-selected.
- **Multiple tenants** → tenant selector.

### Persisted tenant validation

A selected tenant may be persisted (secure storage) purely for UX. It is **never trusted**: on every
authenticated bootstrap the persisted id is re-validated against the live memberships from
`/me/tenants`, reused only if still present, and discarded otherwise. The server's active membership
state is authoritative — there is no owner/manager bypass.

## /me/context

Once a tenant is resolved, the tenant-scoped SDK client (`client.withTenant(tenantId)`) calls
`GET /api/v1/me/context`. Context is reachable **only** through the tenant-scoped client, so it is
structurally impossible to request it before a tenant is chosen.

`/me/context` is used only for management context/navigation. The app displays the returned access
flags exactly as-is and never infers organization → brand → branch → location permissions. **The API
remains authoritative for authorization; client visibility is UX only.**

## Error handling

`src/commerce/errors.ts` classifies failures into distinct states — `auth` (401), `forbidden` (403),
`network` (transport), `contract`, and `server` (5xx). Failed calls surface as errors; they are never
turned into fake successful or empty states, and there is no mock-data fallback.

## Run, test, and build

Requirements: Node.js 24+, pnpm 10.33.1, Git, and an Expo-supported device/emulator.

```bash
pnpm install --frozen-lockfile
cp .env.example .env      # then fill in the two EXPO_PUBLIC_ values
pnpm dev                  # start Expo
```

Quality gates (the CI runs the same):

```bash
pnpm exec expo install --check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build                # expo export (web)
pnpm integration:check    # live probe: requires a reachable Commerce API
```

## Troubleshooting

- **"EXPO_PUBLIC_COMMERCE_API_URL is not configured"** — set it in `.env`. There is no fallback by
  design.
- **"Clerk is not configured"** — set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env`.
- **"Cannot reach the Commerce API"** — the API URL is unreachable from the device; the app does not
  substitute mock data.
- **`integration:check` fails with `ECONNREFUSED`** — expected unless a Commerce API is actually
  running at `EXPO_PUBLIC_COMMERCE_API_URL`.
- **`expo install --check` lists Expo core packages** — a pre-existing patch-version drift in the
  foundation, unrelated to the SDK/Clerk work in this checkpoint.

## Not in this checkpoint

Products, Inventory, Orders, dashboards, reporting, mutations, reservation/allocation, POS,
storefront, payments, returns, customers, cart, and checkout are **out of scope** and not
implemented here.
