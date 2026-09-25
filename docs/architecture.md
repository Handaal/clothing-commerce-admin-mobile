# Admin Mobile Architecture

```text
Clerk (auth, owned by Mobile)
  │  getToken callback (token only — never a Clerk object)
  ▼
@shifted/clothing-commerce-sdk 0.12.1  (packed tarball under vendor/, relative file: path)
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

## Phase 2L Orders extension

`OrderCommerce` renders SDK `commerce` snapshots, payment and reservations without deriving business
state. Orders channel filtering stays in the shared bounded loader via `OrderListQuery.channel`.
Both screens offer explicit refresh through `useAsync`; no new mutation lifecycle is introduced.
SDK 0.7.0 has no management fulfillment command: canonical overall/per-line progress is preserved.
Missing optional commerce data is labelled unavailable. No customer, payment or reservation edits
are exposed. See [validation](phase-2l-validation.md) for real HTTP/component acceptance.

## Scope: Phase 2L online order visibility

Phase 2F-B delivered authentication + session bootstrap plus a read-only management slice; Phase 2G
added the first write surface (inventory Receive/Adjust/Transfer). **Phase 2K turns Products into a
full catalog management workflow** via SDK 0.7.0: create/edit products, lifecycle (draft/active/
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

## Phase 2N Supplier management (SDK 0.9.0)

Suppliers integrate behind a single seam: `resolveSupplierAdapter(client)` (`src/suppliers/adapter.ts`)
returns a concrete, SDK-backed `SupplierAdapter` that maps SDK DTOs ⇄ the Admin-owned domain model
(`src/suppliers/model.ts`). Every supplier screen depends on the interface, never a concrete client, so
they stay transport-agnostic; the adapter hand-writes no HTTP and imports no API source. Capabilities
come from the optional `/me/context` `access.suppliers` block via `supplierCapabilities`
(`src/suppliers/capabilities.ts`): `canRead` gates navigation, `canManage` gates create/edit/status —
the server stays authoritative (403 renders as access-denied). Reads reuse `useAsync` + the shared
bounded paginator; the create/edit form and status toggle reuse the `useMutation` + idempotency-key
discipline, with typed error mapping in `src/suppliers/write-errors.ts`. Search is a typed
`SupplierListQuery` (search/status/cursor) sent server-side — never a client-side filter. The Inventory
Receive form takes an **optional** active-supplier selector (`receiveSuppliers`) plus an optional
supplier reference; "No supplier" is a legacy receipt (unchanged), inactive suppliers are excluded, and
supplier loading is best-effort so it never blocks receiving. No unit-cost/cost-basis fields exist
(deliberately deferred by the API).

## Phase 2O Staff management (SDK 0.11.0)

Staff integrates behind one seam: `resolveStaffAdapter(client)` (`src/staff/adapter.ts`) returns a
concrete SDK-backed `StaffAdapter` mapping SDK DTOs ⇄ the Admin-owned model (`src/staff/model.ts`). Every
staff screen depends on the interface, never a concrete client. Capabilities come from the typed
`/me/context` `access.staff` `{ canRead, canManage }` via `staffCapabilities`. Reads reuse `useAsync` +
the shared bounded paginator; writes reuse `useMutation` + idempotency keys, re-reading the authoritative
`StaffDetail` on success, with real-code error mapping in `src/staff/write-errors.ts`. Two contract facts
shape the design: `createStaff` is **identity-only**, so Add-Staff runs **create then assign as two
independent operations** (`createStaffMembership` + `assignRoleScope`, independent keys) with explicit
create→assign partial-state recovery (retry only the assignment, never re-create); and assignable
role/scope options come from the **canonical server catalogs** (`listAssignableStaffRoles` /
`listAssignableStaffScopes`, paged via the shared bounded paginator), **never** derived from other
members' assignments — so a valid unused role/scope still appears on a fresh tenant. Identity discovery is
an **exact-email 0/1/N lookup** (`findEligibleStaffIdentitiesByEmail`), never a directory browse. Runtime
A–M is proven against a real disposable HTTP API by `scripts/test-staff.mjs` (API repo). See
[phase-2o-foundation.md](phase-2o-foundation.md) and [phase-2o-validation.md](phase-2o-validation.md).

## Phase 2P Promotion management (SDK 0.12.1)

Promotion screens consume the SDK DTOs directly through the narrow `PromotionClient` method pick—no
API-source import and no duplicated wire model. Optional `/me/context` Promotion guidance is normalized
by `promotionCapabilities`; `canRead` and `canManage` stay independent. Reads use `useAsync`; every
mutation uses `useMutation` with a secure per-operation idempotency key and same-key ambiguous retry.

The list follows the SDK's offset/total contract to completion with a finite fail-closed bound. Create
maps UI input to `CreatePromotionRequest`; edit maps only to `UpdatePromotionRequest`, so create-only
target, activation, currency, and global-limit fields are never fabricated as editable. Product/Variant
targets are selected from canonical `listProducts`/`getProduct` data, never raw UUID input. Persisted
lifecycle remains active/inactive; scheduled/expired/exhausted are derived display states. Codes and
single-use vouchers share the canonical Promotion Code operations. The
`PROMOTION_ECONOMICS_LOCKED` recovery explicitly directs deactivate-and-replace.

## Dependency direction

```text
screens (app/**, src/products, src/catalog, src/inventory, src/orders, src/promotions)
  → session tenant client (useSession().getTenantClient(tenantId))
    → packed Commerce SDK (@shifted/clothing-commerce-sdk)
      → Commerce API
```

Never `screens → API source`. Screens depend only on SDK types and the session boundary; they hold
no tokens, build no headers, and issue no direct `fetch`.

## Module map

| Concern                               | Module(s)                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Routes: home                          | `app/index.tsx`                                                                                                |
| Routes: products                      | `app/products/index.tsx`, `app/products/new.tsx`, `app/products/[productId].tsx`                               |
| Routes: inventory                     | `app/inventory/index.tsx`                                                                                      |
| Routes: orders                        | `app/orders/index.tsx`, `app/orders/[orderId].tsx`                                                             |
| Public config                         | `src/config/env.ts`, `src/config/client-metadata.ts`                                                           |
| Clerk provider + cache                | `app/_layout.tsx`, `src/auth/token-cache.ts`                                                                   |
| Commerce SDK boundary                 | `src/commerce/client.ts` (getToken wiring)                                                                     |
| Error classification                  | `src/commerce/errors.ts`                                                                                       |
| Shared cursor pagination              | `src/commerce/pagination.ts`                                                                                   |
| Tenant policy (pure)                  | `src/tenant/selection.ts`                                                                                      |
| Tenant bootstrap + storage            | `src/tenant/bootstrap.ts`, `src/tenant/{storage,secure-storage}.ts`                                            |
| Session state machine                 | `src/session/reducer.ts` (pure), `src/session/SessionProvider.tsx`                                             |
| Request lifecycle                     | `src/ui/useAsync.ts`                                                                                           |
| Products screens (2K)                 | `src/products/{ProductsListScreen,CreateProductScreen,ProductManageScreen}.tsx`, `src/products/display.ts`     |
| Catalog logic (pure, 2K)              | `src/catalog/{operations,money,write-errors,observations,brands,media}.ts`                                     |
| Inventory screen + loader             | `src/inventory/InventoryScreen.tsx`, `src/inventory/load.ts`                                                   |
| Inventory write operations (2G)       | `src/inventory/InventoryOperations.tsx`, `src/inventory/operations.ts`, `src/inventory/write-errors.ts`        |
| Write lifecycle + idempotency         | `src/ui/useMutation.ts`, `src/inventory/idempotency.ts`                                                        |
| Orders screens + loader + fulfillment | `src/orders/{OrdersListScreen,OrderDetailScreen}.tsx`, `src/orders/load.ts`, `src/orders/fulfillment.ts`       |
| Shared UI primitives                  | `src/ui/components.tsx`, `src/ui/SignInScreen.tsx`                                                             |
| Routes: suppliers (2N)                | `app/suppliers/{index,new,[supplierId]}.tsx`, `app/suppliers/edit/[supplierId].tsx`                            |
| Supplier management (2N)              | `src/suppliers/{model,search,status,adapter,load,capabilities,write-errors}.ts`, `src/suppliers/Supplier*.tsx` |
| Routes: Promotions (2P)               | `app/promotions/{index,new,[promotionId]}.tsx`, `app/promotions/edit/[promotionId].tsx`                        |
| Promotion management (2P)             | `src/promotions/*`                                                                                             |

## Server-authoritative authorization

`/me/context` returns per-surface access flags, including optional Supplier, Staff, and Promotion
guidance. Screens use them
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
17. Promotion `canRead` and `canManage` guidance is independent: manage never implies read. It controls
    affordances only; every endpoint remains server-authorized.
18. Promotion economics, redemption counts, and code state are server truth. The client never evaluates
    or stacks discounts. Post-redemption economics are not bypassed; used Promotions are deactivated and
    replaced when economics must change.
