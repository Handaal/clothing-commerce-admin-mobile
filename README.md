# Clothing Commerce Admin Mobile

Expo / React Native management-channel app for a clothing business's **authorized owners and
managers**. It is not a Shifted/platform super-admin app, not a POS/cashier app, not a
customer-shopping app, and not a website layout builder.

## Current scope — Phase 2F-B (management read slice)

This phase establishes the real authentication + data boundary and a **read-only** management read
slice on top of it:

```
Clerk sign-in → session token → @shifted/clothing-commerce-sdk (0.2.0)
  → GET /me/tenants → tenant selection → GET /me/context
  → Products · Inventory · Orders  (read-only)
```

**Auth / session**

- Clerk authentication with the secure token cache (persists sessions across restarts on device)
- `GET /me/tenants` bootstrap, selected-tenant revalidation, `GET /me/context`
- stable `SessionProvider` bootstrap and a tenant-scoped Commerce client

**Management read surfaces**

- Products list and Product Detail
- Inventory (complete, bounded cursor pagination; location names resolved from context)
- Orders list, Order Detail, and read-only fulfillment progress

### Read-only guarantee

Phase 2F-B is strictly read-only. It **does not** implement product mutations, inventory mutations,
order mutations, fulfillment mutations (pick/pack/ship/fulfil), payments, refunds/returns, or
customer management. Every screen's controls are navigation, back, or retry only. Failures surface
as typed error states — never as fake-empty or mock data.

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

### SDK / API boundary and token-callback

The Commerce SDK is **Clerk-agnostic**. It receives only a `getToken` callback and never a Clerk
object or session. Wiring lives in `src/session/SessionProvider.tsx` and `src/commerce/client.ts`:

```ts
createConfiguredCommerceClient({ getToken: () => clerkGetToken() });
```

Boundary facts a maintainer can rely on:

- Mobile never imports Commerce API source, schemas, or contracts — only the packed SDK.
- The SDK owns the `Authorization`, `X-Client-Type`/`X-Client-Version`, and `X-Tenant-Id` headers.
  There is no hand-written Commerce client and no manual header construction anywhere.
- `getMyTenants()` (`GET /me/tenants`) is the bootstrap request and is sent **without** an
  `X-Tenant-Id`.
- Every tenant-scoped request goes through `getTenantClient(tenantId)`
  (`client.withTenant(tenantId)`); the SDK owns `X-Tenant-Id` from that point on.
- **The server remains authoritative for authorization.** `/me/context` access flags are UX
  guidance for showing/hiding navigation and friendly no-access states — never authorization.

Tenant methods actually used by this phase (all via the tenant-scoped client):

| Method                  | Endpoint             | Used by                          |
| ----------------------- | -------------------- | -------------------------------- |
| `getContext()`          | `GET /me/context`    | session bootstrap / access flags |
| `listProducts()`        | `GET /products`      | Products list                    |
| `getProduct(productId)` | `GET /products/{id}` | Product Detail                   |
| `listInventory()`       | `GET /inventory`     | Inventory                        |
| `listOrders()`          | `GET /orders`        | Orders list                      |
| `getOrder(orderId)`     | `GET /orders/{id}`   | Order Detail                     |

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

- **Zero tenants** → explicit no-active-business / no-access screen. No tenant is fabricated.
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

## Management read surfaces

All read surfaces reuse one tenant-scoped client and one request lifecycle (`useAsync`, below). None
of them expose any mutation control.

### Products

```
authenticated session → tenant → listProducts() → Products list
real product id       → getProduct(productId)    → variants / options / prices
```

- **Products list** (`src/products/ProductsListScreen.tsx`): states — loading, populated, legitimate
  empty, no-access (no `catalog.read`), API 403, network/API error, explicit retry. Rows navigate by
  the real product id. Brand names are resolved from `/me/context`.
- **Product Detail** (`src/products/ProductDetailScreen.tsx`): states — loading, success, 404, 403,
  network/API error, explicit retry, back. Renders variants, options, and prices.
- No mock fallback; no product mutations.

### Inventory

```
authenticated session → tenant → listInventory() → complete authorized inventory read
```

- Fields used from the read contract: `productName`, `sku`, `onHand`, and `inventoryLocationId`.
  Location **names** are resolved from `/me/context → access.inventory.locations` (the inventory
  item itself carries only the location id). SDK 0.2.0 does **not** expose available / reserved /
  allocated quantities on this read contract, so they are not displayed.
- **Cursor pagination:** the screen loads the **complete** authorized inventory via the shared
  `collectAllPages` helper (`src/commerce/pagination.ts`) — it follows the server's `nextCursor` in
  server order, page one is never presented as the whole list, and there is a finite maximum-page
  safety bound.
- **Fail-closed cap:** if the client reaches its maximum permitted page count while the server still
  reports additional pages, it throws `PaginationCapExceededError` and the screen shows an error
  state (with retry) rather than presenting partial inventory as complete.
- Read-only: no adjustment, transfer, receiving, reservation/allocation, or quantity edit. Zero
  balances render honestly as `0`.

### Orders and fulfillment

```
authenticated session → tenant → listOrders() → Orders list
real order id         → getOrder(orderId)      → Order Detail
```

- **Orders list** (`src/orders/OrdersListScreen.tsx`): states — loading, populated, legitimate
  empty, no-access (no `orders.read`), API 403, network/API error, explicit retry. Complete bounded
  cursor pagination (same `collectAllPages`, same fail-closed cap). Rows navigate by the real order
  id. Totals are formatted from minor currency units.
- **Order Detail** (`src/orders/OrderDetailScreen.tsx`): states — loading, success, 404, 403,
  network/API error, explicit retry, back. Contract-backed sections: order header, order lines,
  monetary totals, and `fulfillmentProgress`.
- **Fulfillment semantics:** the overall status is taken **from the server**
  (`unfulfilled` | `partially_fulfilled` | `fulfilled`) and shown verbatim. Per-line progress uses
  the explicit `orderedQuantity` / `fulfilledQuantity` fields; the client may display `X / Y
fulfilled` but never manufactures fulfillment business state and never marks a partial order
  complete.
- **Stale-detail protection:** the detail fetch is keyed on `[client, orderId]`. Changing `orderId`
  starts a fresh request, and a slower previous-order response can never overwrite the newer order's
  detail.
- Read-only: no create/edit/cancel order, no pick/pack/ship/fulfil, no refund/return/payment.

## Shared request lifecycle

### `useAsync` (`src/ui/useAsync.ts`)

Every read surface runs through one small hook so lifecycle behavior is uniform and testable:

- one **bounded** initial request per real input change (callers pass a `useCallback` producer keyed
  on the tenant-scoped client and any path param);
- an explicit `reload` for retry;
- failures settle into a **stable** classified-error state (via `src/commerce/errors.ts`) — never a
  fake-empty or mock success;
- **stale-result protection:** an in-flight request is marked inactive on unmount or when the
  producer changes, so a late response cannot overwrite newer state (this is what makes order
  A → order B navigation safe);
- ordinary rerenders do **not** refetch; changing the producer's dependencies **does** create a
  fresh request.

### `SessionProvider` stability

- Clerk's `getToken` identity can change on every render; the latest `getToken` is kept behind a
  stable, ref-backed token provider, so the Commerce client is built **once** and token refreshes are
  transparent.
- Tenant-scoped clients are cached per tenant id but hold **no token value** — they always call the
  current `getToken` through the ref.
- The bootstrap effect is keyed on stable session identity (not on session state), so it cannot loop.
- Sign-out clears the persisted tenant selection and the authenticated UI state; authenticated
  management surfaces are not kept live after sign-out.

## Error handling

`src/commerce/errors.ts` classifies failures into distinct states — `auth` (401), `forbidden` (403),
`not-found` (404), `network` (transport), `contract`, and `server` (5xx). Failed calls surface as
errors; they are never turned into fake successful or empty states, and there is no mock-data
fallback. A `PaginationCapExceededError` (see Inventory) surfaces through this same path as a stable,
retryable read error.

## Run, test, and build

Requirements: Node.js 24+, pnpm 10.33.1, Git, and an Expo-supported device/emulator.

```bash
pnpm install --frozen-lockfile
cp .env.example .env      # then fill in the two EXPO_PUBLIC_ values
pnpm dev                  # start Expo
```

Quality gates (CI runs the same set, in this order):

```bash
pnpm exec expo install --check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build                # expo export (web)
pnpm integration:check    # live probe: requires a reachable Commerce API
```

## Local development against the local Commerce API

The Commerce API is a **separate repository** and remains the source of truth for identity,
authorization, tenant isolation, data, and its own development-fixture provisioning. Meaningful local
read-slice testing requires all of the following to be prepared **on the API side first**, per that
repository's own development documentation:

1. the local Commerce API running;
2. its local Supabase / API environment prepared;
3. the existing development identity provisioned;
4. the deterministic commerce development fixture provisioned;
5. this app configured with the local Commerce API URL (`EXPO_PUBLIC_COMMERCE_API_URL`) and a Clerk
   development publishable key (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`) — placeholders only live in
   `.env.example`;
6. a real Clerk **development** login.

Do not copy Clerk subjects, user emails, secret keys, service-role keys, SQL, or DB credentials into
this repository. Refer to the Commerce API repository's provisioning documentation for those details.

### Deterministic development fixture (dev/acceptance only)

These values describe the API repository's **development fixture** and are used only to validate the
read slice locally. They are **development/test expectations, never a production dependency** — no
production code or component depends on these ids or numbers.

- **Products:** `Dev Linen Shirt` (active) and `Dev Canvas Tote` (draft).
- **Inventory** at `Dev Flagship Stockroom`: `M = 22`, `L = 39`, `Tote = 12`.
- **Orders:** exactly one deterministic order — channel `online`, status `placed`, currency `USD`,
  total minor `12995` (renders as `USD 129.95`).
- **Order Detail:** 2 lines, 5 ordered units total.
- **Fulfillment:** M line `3 / 3`, L line `1 / 2`, overall **partially fulfilled**.

## Management read-slice acceptance checklist

With the local API + fixture prepared and a Clerk dev login completed, walk:

```
Login → dev-local → Products → Product Detail → Inventory → Orders → Order Detail
      → sign out → sign in again
```

Verify:

- **Products:** exactly 2 fixture products; Product Detail renders real variants/options/prices.
- **Inventory:** `22 / 39 / 12` at `Dev Flagship Stockroom`.
- **Orders:** exactly one order; `online` / `placed`; total formatted correctly from minor units
  (`USD 129.95`).
- **Order Detail:** two lines; fulfillment `3 / 3` and `1 / 2`; overall **partial** (never shown as
  fully fulfilled).
- **Stability:** no repeated request loop; no "Maximum update depth" error; no console/runtime
  errors; no mutation controls anywhere; sign-out removes authenticated management surfaces; signing
  in again re-bootstraps successfully.

## Troubleshooting

- **"EXPO_PUBLIC_COMMERCE_API_URL is not configured"** — set it in `.env`. There is no fallback by
  design.
- **"Clerk is not configured"** — set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env`.
- **"Cannot reach the Commerce API"** — the API URL is unreachable from the device; the app does not
  substitute mock data.
- **`integration:check` fails with `ECONNREFUSED`** — expected unless a Commerce API is actually
  running at `EXPO_PUBLIC_COMMERCE_API_URL`.
- **`expo install --check` lists Expo core packages** — a pre-existing patch-version drift in the
  foundation, unrelated to the SDK/Clerk work.
- **Local `typecheck` reports impossible route errors after adding/renaming routes** — the typed
  routes file `.expo/types/router.d.ts` is generated by the Expo dev server and is gitignored; a
  stale/interrupted dev server can leave a malformed copy. Fix it locally by:
  1. stopping any stale Expo dev servers;
  2. removing only the gitignored generated route-type state (`.expo/types/router.d.ts`) if needed;
  3. starting Expo cleanly (`pnpm dev`) so the route declarations regenerate;
  4. re-running `pnpm typecheck`.
     Do **not** disable typed routes, weaken TypeScript, add `@ts-ignore`, or commit
     `.expo/types/router.d.ts`. (CI is unaffected: a fresh checkout has no generated file and uses
     Expo's permissive route-type fallback.)

## Not in this phase

Product/inventory/order/fulfillment mutations, payments, refunds/returns, customer management,
dashboards, reporting/analytics, purchasing, reservation/allocation, POS, storefront, cart, and
checkout are **out of scope** and not implemented here.
