# Admin Mobile Architecture

```text
Clerk (auth, owned by Mobile)
  │  getToken callback (token only — never a Clerk object)
  ▼
@shifted/clothing-commerce-sdk 0.6.0  (packed tarball under vendor/, relative file: path)
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

## Scope: Phase 2K catalog management

Phase 2F-B delivered authentication + session bootstrap plus a read-only management slice; Phase 2G
added the first write surface (inventory Receive/Adjust/Transfer). **Phase 2K turns Products into a
full catalog management workflow** via SDK 0.6.0: create/edit products, lifecycle (draft/active/
archived), variants, selling prices (integer-minor-unit safe), media upload (signed-URL intent →
register), and Storefront publication (publish/unpublish). Orders remain read-only. Taxonomy
(category/collection) writes are deliberately deferred and never invented. All catalog writes reuse the
same explicit `useMutation` lifecycle and per-operation idempotency keys as inventory, and re-read the
authoritative product on success.

Catalog uses the same two-lifecycle split as inventory (`useAsync` for reads, `useMutation` for
writes). Two contract facts shape the design:

- `GET /products/{id}` returns no `storefrontStatus`, `slug`, or `description`, so publication state and
  slug are surfaced as **session observations** (`src/catalog/observations.ts`) fed by write responses,
  never guessed — the same pattern inventory uses for `version`.
- The catalog access context exposes only `canRead` (no author/publish flag, unlike
  `access.inventory.write.*`), so write controls cannot be pre-gated per capability; the server is the
  sole authority and a real `403` renders as "Not authorized — nothing was applied".

## Dependency direction

```text
screens (app/**, src/products, src/catalog, src/inventory, src/orders)
  → session tenant client (useSession().getTenantClient(tenantId))
    → packed Commerce SDK (@shifted/clothing-commerce-sdk)
      → Commerce API
```

Never `screens → API source`. Screens depend only on SDK types and the session boundary; they hold
no tokens, build no headers, and issue no direct `fetch`.

## Module map

| Concern                               | Module(s)                                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Routes: home                          | `app/index.tsx`                                                                                            |
| Routes: products                      | `app/products/index.tsx`, `app/products/new.tsx`, `app/products/[productId].tsx`                           |
| Routes: inventory                     | `app/inventory/index.tsx`                                                                                  |
| Routes: orders                        | `app/orders/index.tsx`, `app/orders/[orderId].tsx`                                                         |
| Public config                         | `src/config/env.ts`, `src/config/client-metadata.ts`                                                       |
| Clerk provider + cache                | `app/_layout.tsx`, `src/auth/token-cache.ts`                                                               |
| Commerce SDK boundary                 | `src/commerce/client.ts` (getToken wiring)                                                                 |
| Error classification                  | `src/commerce/errors.ts`                                                                                   |
| Shared cursor pagination              | `src/commerce/pagination.ts`                                                                               |
| Tenant policy (pure)                  | `src/tenant/selection.ts`                                                                                  |
| Tenant bootstrap + storage            | `src/tenant/bootstrap.ts`, `src/tenant/{storage,secure-storage}.ts`                                        |
| Session state machine                 | `src/session/reducer.ts` (pure), `src/session/SessionProvider.tsx`                                         |
| Request lifecycle                     | `src/ui/useAsync.ts`                                                                                       |
| Products screens (2K)                 | `src/products/{ProductsListScreen,CreateProductScreen,ProductManageScreen}.tsx`, `src/products/display.ts` |
| Catalog logic (pure, 2K)              | `src/catalog/{operations,money,write-errors,observations,brands,media}.ts`                                 |
| Inventory screen + loader             | `src/inventory/InventoryScreen.tsx`, `src/inventory/load.ts`                                               |
| Inventory write operations (2G)       | `src/inventory/InventoryOperations.tsx`, `src/inventory/operations.ts`, `src/inventory/write-errors.ts`    |
| Write lifecycle + idempotency         | `src/ui/useMutation.ts`, `src/inventory/idempotency.ts`                                                    |
| Orders screens + loader + fulfillment | `src/orders/{OrdersListScreen,OrderDetailScreen}.tsx`, `src/orders/load.ts`, `src/orders/fulfillment.ts`   |
| Shared UI primitives                  | `src/ui/components.tsx`, `src/ui/SignInScreen.tsx`                                                         |

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
7. Reads perform no mutations; a client pagination cap fails closed rather than presenting truncated
   data as complete.
8. The only writes are inventory Receive/Adjust/Transfer, each via the SDK with an app-supplied
   `Idempotency-Key` (secure v4 UUID). Retry of an ambiguous failure reuses the same key; a new
   operation mints a new one. The SDK owns the header.
9. Write authorization is the API's alone. `/me/context → access.inventory.write` is server-derived UX
   guidance for action visibility and per-location choices; a real `403` still renders as access denied.
   There is no owner/admin/role-name bypass, and Opening Stock / Issue are never exposed.
10. Adjust reconciles to an absolute count under `expectedVersion`, taken only from the current SDK
    0.3.1 `InventoryListItem.version`. A stale version yields `409 CONCURRENT_MODIFICATION`: the stale
    attempt and key are invalidated, Inventory refreshes, and the operator must review/re-enter the
    count before a new-key submission against the refreshed row version. There is never a blind retry.
11. After a successful write the authoritative Inventory read is refreshed; on-screen balances are the
    server re-read, never a locally computed final number.
12. Catalog writes (create/edit/lifecycle/variant/price/media/publish) go through the SDK with an
    app-supplied `Idempotency-Key` (same lifecycle as inventory). The one exception is the media upload
    intent, which by contract carries no key. Selling prices convert decimal input to integer minor
    units with pure integer/string math — never floating point (`src/catalog/money.ts`).
13. Internal lifecycle status (draft/active/archived) and Storefront publication (unpublished/
    published) are distinct states, shown distinctly. Only valid lifecycle transitions are offered; the
    server still authoritatively rejects the rest. Archive is a retained, restorable soft-state, never a
    delete.
14. Publication state, slug, and description are not in the product read contract; they are surfaced as
    session observations fed by write responses (`src/catalog/observations.ts`) and shown as
    "not observed this session" when unknown — never guessed.
15. Media bytes go only to object storage via a server-issued signed URL, then metadata is registered
    through the SDK; raw images never touch the API database and the client never chooses the storage
    path. A missing signed URL is isolated as an environmental storage gap.
16. Catalog authoring honours the single/multi-brand invariant (`src/catalog/brands.ts`): a single
    accessible brand is used directly, multiple require explicit selection, and none disables authoring
    (no guessed brand id). Taxonomy writes are out of scope and never invented.
