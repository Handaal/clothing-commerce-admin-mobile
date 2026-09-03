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

## Scope: Phase 2F-B management read slice

The implemented surface is authentication + session bootstrap plus a **read-only** management read
slice: Products (list + detail), Inventory, and Orders (list + detail with fulfillment progress).
There are no mutation paths of any kind in this phase.

## Dependency direction

```text
screens (app/**, src/products, src/inventory, src/orders)
  → session tenant client (useSession().getTenantClient(tenantId))
    → packed Commerce SDK (@shifted/clothing-commerce-sdk)
      → Commerce API
```

Never `screens → API source`. Screens depend only on SDK types and the session boundary; they hold
no tokens, build no headers, and issue no direct `fetch`.

## Module map (Phase 2F-B)

| Concern                               | Module(s)                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Routes: home                          | `app/index.tsx`                                                                                          |
| Routes: products                      | `app/products/index.tsx`, `app/products/[productId].tsx`                                                 |
| Routes: inventory                     | `app/inventory/index.tsx`                                                                                |
| Routes: orders                        | `app/orders/index.tsx`, `app/orders/[orderId].tsx`                                                       |
| Public config                         | `src/config/env.ts`, `src/config/client-metadata.ts`                                                     |
| Clerk provider + cache                | `app/_layout.tsx`, `src/auth/token-cache.ts`                                                             |
| Commerce SDK boundary                 | `src/commerce/client.ts` (getToken wiring)                                                               |
| Error classification                  | `src/commerce/errors.ts`                                                                                 |
| Shared cursor pagination              | `src/commerce/pagination.ts`                                                                             |
| Tenant policy (pure)                  | `src/tenant/selection.ts`                                                                                |
| Tenant bootstrap + storage            | `src/tenant/bootstrap.ts`, `src/tenant/{storage,secure-storage}.ts`                                      |
| Session state machine                 | `src/session/reducer.ts` (pure), `src/session/SessionProvider.tsx`                                       |
| Request lifecycle                     | `src/ui/useAsync.ts`                                                                                     |
| Products screens                      | `src/products/{ProductsListScreen,ProductDetailScreen}.tsx`, `src/products/display.ts`                   |
| Inventory screen + loader             | `src/inventory/InventoryScreen.tsx`, `src/inventory/load.ts`                                             |
| Orders screens + loader + fulfillment | `src/orders/{OrdersListScreen,OrderDetailScreen}.tsx`, `src/orders/load.ts`, `src/orders/fulfillment.ts` |
| Shared UI primitives                  | `src/ui/components.tsx`, `src/ui/SignInScreen.tsx`                                                       |

## Server-authoritative authorization

`/me/context` returns per-surface access flags (`catalog`, `inventory`, `orders`). Screens use them
only to show/hide navigation and render friendly no-access states. They are never authorization: the
API enforces every read, and a real `403` surfaces as an explicit forbidden state — never an empty
success. The client never reconstructs organization → brand → branch → location rules; it renders
exactly the already-authorized rows the API returns.

## Shared pagination (`src/commerce/pagination.ts`)

`collectAllPages(fetchPage, maxPages)` is the one place cursor pagination lives. It preserves server
order, follows `nextCursor` until the server reports completion (`hasMore === false` or a null
cursor), propagates continuation failures, and is bounded by a finite `maxPages`.

**Fail-closed cap.** If the bound is reached while the server still advertises another page, the
helper throws `PaginationCapExceededError` instead of returning the accumulated pages — a safety cap
must never silently convert an incomplete server result into a complete-looking list. Both
`src/inventory/load.ts` (`loadAllInventory`) and `src/orders/load.ts` (`loadAllOrders`) delegate to
it and therefore inherit this behavior; the error is surfaced by the screens as a stable, retryable
read error.

## Request lifecycle (`src/ui/useAsync.ts`)

A single hook gives every read surface: one bounded initial request per real input change, an
explicit retry, a stable classified-error state, stale-result protection (a late response cannot
overwrite newer state — the basis of Order Detail's order A → order B safety), unmount safety, and
"ordinary rerenders do not refetch." Producers are `useCallback`s keyed on the tenant-scoped client
and any path param.

## Boundary invariants

1. The Commerce SDK is Clerk-agnostic — it receives only a `getToken` callback.
2. The SDK owns all auth/tenant/client headers; the app never hand-writes them.
3. Tenant-scoped calls (`/me/context`, products, inventory, orders) are reachable only via
   `client.withTenant(tenantId)`, so they cannot run before tenant resolution; `/me/tenants` is the
   only request made without `X-Tenant-Id`.
4. Persisted tenant selection is re-validated against `/me/tenants` on every bootstrap; the server is
   authoritative.
5. Failures surface as typed errors — never mock data or fake-empty states.
6. No `EXPO_PUBLIC_` value is a secret; a missing API URL fails loudly.
7. The read slice performs no mutations; a client pagination cap fails closed rather than presenting
   truncated data as complete.
