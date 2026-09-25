# Clothing Commerce Admin Mobile

Expo / React Native management-channel app for a clothing business's **authorized owners and
managers**. It is not a Shifted/platform super-admin app, not a POS/cashier app, not a
customer-shopping app, and not a website layout builder.

## Current scope — Phase 2Q-B preparation (Admin reporting UI)

Phase 2Q-B prepares the complete Admin-owned reporting shell while the canonical API contract and SDK
0.13.0 are being finalized. It adds deny-by-default Reporting navigation, seven Expo Router routes,
normalized presentation view-models, date/currency controls, loading/empty/error/access-denied/refresh
states, bounded page controls, and the V1 dashboard/domain presentations. **Transport binding pending
SDK 0.13.0:** production resolves no reporting adapter and never guesses an endpoint or response shape.
See [the Phase 2Q-B preparation notes](docs/phase-2q-b-preparation.md).

Reporting is online-only and management-only. Currency groups are never added together, tenant-local
dates and timezone boundaries remain server-supplied, and disabled CSV affordances are reserved only
for Product/Variant sales, Inventory movements, Returns/refunds, and Supplier receipt history.

## Phase 2P (Promotion management)

Phase 2P adds complete V1 Promotion management to the established owner/manager app: list/detail,
create/edit, activate/deactivate, Product/Variant targeting, and Promotion Code/voucher management.
All pricing, eligibility, authorization, redemption counts, and post-redemption locks remain
server-authoritative.

```
Clerk sign-in → session token → @shifted/clothing-commerce-sdk (0.12.1)
  → GET /me/tenants → tenant selection → GET /me/context
  → Products  read  +  create · edit · lifecycle · variants · prices · media · publish   (authorized writes)
  → Inventory read  +  Receive · Adjust · Transfer                                        (authorized writes)
  → Orders    (read-only)  +  Returns / refunds visibility                                (read-only)
  → Promotions read + create · edit · lifecycle · codes                                   (authorized writes)
```

**Auth / session**

- Clerk authentication with the secure token cache (persists sessions across restarts on device)
- `GET /me/tenants` bootstrap, selected-tenant revalidation, `GET /me/context`
- stable `SessionProvider` bootstrap and a tenant-scoped Commerce client

**Management surfaces**

- Products list, **Create product**, and full **Product management** (edit · lifecycle · variants ·
  prices · media · publish) — see [Catalog management](#catalog-management-phase-2k)
- Inventory (complete, bounded cursor pagination; location names resolved from context) **plus the
  Receive / Adjust / Transfer write operations** (see [Inventory operations](#inventory-operations-phase-2g))
- Orders list, Order Detail, and read-only fulfillment progress
- Promotions list/detail, create/edit, active/inactive lifecycle, and Promotion Codes

### Scope guarantee

The mutations in this app are catalog operations, three inventory operations, Supplier/Staff
management, and the bounded Promotion V1 operations documented below. It
**does not** implement order or fulfillment mutations (pick/pack/ship/fulfil), payments, POS,
taxonomy (category/collection) writes, website layout editing, or storefront checkout. Returns and
refunds are **read-only visibility** only (Phase 2M below): the app renders returns, refund state and
disposition but never initiates a return, settles a refund, or issues any returns mutation, even
though SDK 0.8.0 exposes those operations. Taxonomy is deliberately deferred (Phase 2J deferred it
API-side) and is **not** invented here. Failures surface as typed error states — never as fake-empty
or mock data.

## Online order visibility (Phase 2L)

SDK **0.7.0** extends the existing management Order projection with optional `commerce`.
Orders show explicit **ONLINE / POS** channel badges. The **All / POS / Online** filter uses the
SDK's server-side channel query across every cursor page, preserving authorization and bounded
pagination. Refresh orders restarts the active filter from page one.

Order Detail retains order number, channel, status, placement time, lines, quantities, prices,
currency/total, cancellation and canonical fulfillment progress. The contract exposes `placedAt`,
not a separate creation timestamp, so the screen labels it **Placed**. It adds:

- **Order snapshot:** checkout contact and delivery, explicitly separate from a mutable customer
  profile. Recipient, phone, full supplied address and delivery notes are read-only.
- **Payment:** the API's exact pending/authorized/captured/failed/cancelled/refunded state, method,
  amount/currency and provider when supplied. Pending COD is never treated as captured, even after
  fulfillment. There are no payment actions.
- **Stock commitment:** each supplied reservation's reserved, consumed/fulfilled, released or
  expired state, committed/consumed quantities and expiry when supplied. No client ATS calculation,
  local-clock expiry decision or aggregate fulfillment inference.
- **Refresh order:** re-reads authoritative facts; loading/error replaces the old detail. Missing
  commerce/snapshots/payment or empty reservations are explicitly unavailable, never fabricated.
  Existing not-found, denied, session, network and contract-error states remain distinct.

Fulfillment remains the existing read-only overall and per-line progress. SDK 0.8.0 exposes no
management fulfillment operation; no new action or duplicate fulfillment logic is introduced.

See [Phase 2L validation](docs/phase-2l-validation.md) for acceptance evidence and limits.

## Returns & refunds visibility (Phase 2M)

SDK **0.8.0** adds a canonical returns domain that serves both POS and ONLINE orders. This app makes
it **visible** — it never initiates returns or settles refunds (there is no cashier/return terminal
here, even though the SDK exposes `createReturn` / `settleRefund`).

- **Order Detail** now shows per-line **returned** quantity and a **Returns & refunds** summary
  (exact pending vs refunded split) from the order projection — present only when the caller also
  holds return-read scope, and never shown as activity when nothing has been returned.
- **Return history** is integrated into Order Detail. The SDK has no global returns list, so history
  is always scoped to its original order (`listReturns`) — never a client-side database. Each entry
  shows the return reference, source channel (**POS / ONLINE**), date/time, returned value, exact
  refund state and a disposition summary, and opens the full return.
- **Return Detail** (`getReturn`) renders the server's own fields: original order, lines, quantities,
  reason, disposition, refund amount, refund state, actor/source and timestamps.
- **Refund state** is rendered exactly as the server reports it — `pending`, `succeeded` or `failed`.
  A pending obligation is never presented as settled; `failed` still notes the amount stays reserved.
- **Inventory disposition** is shown as its operational effect: `restock` re-enters sellable
  inventory (with the canonical receipt/operation id when present); non-restock is damaged /
  write-off that does not re-enter stock. No warehouse subledger internals are exposed.
- **Authorization** is server-authoritative. The return history section maps a return-scope denial
  (403) distinctly from not-found and network/transient failures, and does so **without** breaking
  the rest of the order body.

See [Phase 2M validation](docs/phase-2m-validation.md) for acceptance evidence and limits.

## Supplier management (Phase 2N)

**Integrated against the real Supplier API (SDK 0.9.0).** The Commerce API's Supplier Core has merged
and its contract is frozen; Admin Mobile now reads and writes suppliers through the SDK. The Phase 2N
foundation was built first, so this was a narrow, mapping-only integration. Nothing fabricates supplier
data — the server is authoritative for persistence, uniqueness, lifecycle and permissions. See
[docs/phase-2n-foundation.md](docs/phase-2n-foundation.md) for the full contract write-up.

- **Capabilities & navigation:** `/me/context` exposes an optional `access.suppliers`
  `{ canRead, canManage }`, read by `supplierCapabilities` (`src/suppliers/capabilities.ts`). `canRead`
  gates the **Manage suppliers** entry; `canManage` gates **create** (list) and **edit** + **status
  change** (detail). The API still authorizes every read/write, and a 403 surfaces as access-denied
  (Catalog · Inventory · Orders · Returns are untouched).
- **Integration seam** (`resolveSupplierAdapter`, `src/suppliers/adapter.ts`): a concrete, SDK-backed
  `SupplierAdapter` mapping SDK DTOs ⇄ the Admin-owned model (`referenceCode`⇄`code`, null⇄undefined,
  structured address⇄flat string). Screens depend only on the interface; no hand-written HTTP, no API
  source imports, and the SDK owns the idempotency header.
- **List + search** (`SuppliersListScreen.tsx`, `search.ts`): loading / empty / classified-error /
  populated states and active-inactive presentation. The typed search state (`term` + status filter)
  maps to a **server-side** `SupplierListQuery` (search/status/cursor) followed by the shared bounded
  paginator — never a client-side filter of a downloaded set.
- **Detail** (`SupplierDetailScreen.tsx`): the editable record and its **receiving-history** section
  are clearly separated, with a confirmed, reversible active/inactive toggle — never a delete.
- **Create/edit** (`SupplierForm.tsx`): one reusable form mapping the normalized draft to the SDK
  create/update inputs, submitting with an idempotency key (retry reuses the same key; a correctable
  rejection like a duplicate code offers an edit affordance). `onSaved` fires only on the real response.
- **Receiving history** (`SupplierReceivingHistory.tsx`): reads the canonical `listSupplierReceipts`
  page (date · destination · reference · lines · quantities · actor). Not a second ledger, never
  reconstructed client-side; loads independently so an `inventory.read` scope denial renders distinctly.
- **Inventory Receive linkage:** the Receive form offers an **optional** active-supplier selector plus
  an optional supplier reference (`InventoryOperations.tsx` `receiveSuppliers`, active suppliers loaded
  in `InventoryScreen.tsx`). **"No supplier"** keeps a legacy receipt unchanged; inactive suppliers are
  excluded; supplier linking is best-effort and never blocks receiving.

### Deferrals & non-goals

**No unit-cost/cost-basis of any kind** (supplier cost, cost price, acquisition/landed cost,
margin/profit) — the API deliberately deferred cost accounting. Also **not** built: Purchase Orders,
RFQs, supplier invoices, Accounts Payable, procurement approvals, a supplier portal, supplier payments,
and **permanent supplier deletion** (inactive is a retained state, not a delete).

## Staff management (Phase 2O)

**Integrated against the real Staff API (SDK 0.11.0, incl. the canonical assignment catalogs).** The
Commerce API's Staff Core and assignment catalogs have merged, and the foundation is wired to the real SDK
through a single mapping in `src/staff/adapter.ts` — every Staff screen still depends only on the
`StaffAdapter` interface and the local model, so integration was a mapping change, not a screen rewrite.
Nothing fabricates staff data or a fake success. See
[docs/phase-2o-foundation.md](docs/phase-2o-foundation.md) and
[docs/phase-2o-validation.md](docs/phase-2o-validation.md) for the full write-up.

- **Concept:** staff is operational access management, **not HR**. A Staff record is a projection over
  an existing tenant **Membership** plus identity and authorization (`Role` + `AccessScope` **coupled
  per assignment**). Local Admin-owned types (`src/staff/model.ts`) stay decoupled from the SDK DTOs.
- **Adapter seam** (`resolveStaffAdapter(client)`, `src/staff/adapter.ts`): one `StaffAdapter` interface
  (list/get/find-identities/create-membership/lifecycle/assign/unassign/list-roles/list-scopes),
  SDK-backed. The SDK owns the transport, tenant header and `Idempotency-Key`. Two contract realities:
  `createStaff` is identity-only, so Add-Staff runs **create then assign as two independent operations**
  (`createStaffMembership` + `assignRoleScope`, independent idempotency keys) with explicit
  create→assign partial-state recovery; and assignable role/scope options come from the **canonical
  server catalogs** (`listAssignableStaffRoles` / `listAssignableStaffScopes`, paged), **never** derived
  from other members' assignments — so a valid unused role/scope still appears, even on a fresh tenant.
- **Capability seam** (`src/staff/capabilities.ts`): reads the typed `access.staff` `{ canRead, canManage }`
  (deny-by-default). `canRead` gates the **Manage staff** entry; `canManage` gates Add-Staff and every
  mutation. The API stays authoritative; a 403 surfaces distinctly.
- **List / detail / Add-Staff** (`StaffListScreen.tsx`, `StaffDetailScreen.tsx`, `AddStaffFlow.tsx`):
  server-side search + status filter (incl. `invited`) with bounded pagination; assignments shown as
  role+scope pairs; confirmed lifecycle (active / suspended / **deactivated** = retained, no delete).
  Add-Staff **links an existing provisioned identity** by **exact-email 0/1/N lookup** (explicit select,
  **no raw-UUID entry**) — no Clerk invite, email or password. Roles/scopes come from the canonical
  catalogs; a create that succeeds before its assignment fails is recovered by retrying **only** the
  assignment (never re-creating), so at most one membership ever results.
- **Read-only mode** (`staff.read` without `staff.manage`): list + detail remain; all mutation
  affordances are withheld.
- **Anti-escalation / last-admin surfaces** (`src/staff/write-errors.ts`): the real API codes
  (`STAFF_PRIVILEGE_ESCALATION` · `LAST_STAFF_ADMIN` · `STAFF_CONFLICT` · `IDENTITY_INACTIVE` ·
  `INVALID_STAFF` · `IDEMPOTENCY_CONFLICT` · `STAFF_NOT_FOUND`) map to distinct, non-actionable UI states;
  `IDEMPOTENCY_CONFLICT` is never hidden.

- **Runtime acceptance (A–M):** driven against a real disposable HTTP API by `scripts/test-staff.mjs` (API
  repo) — **9/9 UI scenarios + 117 RLS tests pass**. See
  [docs/phase-2o-validation.md](docs/phase-2o-validation.md).

**Remaining after 2O (product, not blockers):** role/scope/target **authoring** stays deferred (V1 assigns
existing roles/scopes by id); a single "create with initial assignment" endpoint would make Add-Staff
atomic (today it is create + assign with recovery). **Non-goals:** HR/payroll, role/permission authoring,
scope/branch/location creation, and any Clerk invitation flow.

## Promotion management (Phase 2P)

**Integrated against the canonical Promotion API with SDK 0.12.1.** `/me/context` supplies optional,
independent `access.promotions { canRead, canManage }` guidance. `canRead` alone controls navigation and
read surfaces; `canManage` never implies read. Read-only users keep list/detail access while every
create/edit/lifecycle/code affordance is withheld. The API independently authorizes every request.

- **List/detail:** compact activation, benefit type/value where supplied, target, channel, persisted or
  derived effective state, schedule, restrictions, redemption usage/remaining, and codes.
- **Create/edit:** one scrolling form with Basics, Benefit, Eligibility, Usage, Schedule, and Review.
  It submits only SDK V1 fields. Product/Variant targets come from canonical Catalog reads and are
  selected by name—operators never type UUIDs. Target/activation/global-limit fields remain create-only
  because the SDK exposes no edit contract for them.
- **Lifecycle:** persisted state is only `active` / `inactive`; `scheduled`, `expired`, and `exhausted`
  are display-only effective states. Activate/deactivate use idempotent SDK writes.
- **Codes/vouchers:** reusable codes, capped codes, and single-use vouchers (`maxRedemptions = 1`) are
  one Promotion Code domain. Active codes can be disabled; there is no separate Voucher model.
- **After redemption:** economics are shown as locked. If a race still returns
  `PROMOTION_ECONOMICS_LOCKED`, the operator is told to deactivate the used Promotion and create a new
  one; the app never bypasses the server lock.
- **V1 limits:** no stacking configuration, customer-specific/first-order Promotions, per-customer
  limits, bulk vouchers, gift cards, BOGO, quantity tiers, cashier discounts, analytics, exports, or
  generic rule builder.

See [Phase 2P validation](docs/phase-2p-validation.md).

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

- Active SDK: `@shifted/clothing-commerce-sdk` **0.12.1**
- Artifact: `vendor/shifted-clothing-commerce-sdk-0.12.1.tgz`
- `package.json` dependency: `file:vendor/shifted-clothing-commerce-sdk-0.12.1.tgz`
- SHA-256: `4fcd8076052cac6b4717b6eaa030a91f054398578cbbde9ceb69e7cfc819c7a0`

### Verify the SDK artifact

```bash
# macOS/Linux
shasum -a 256 vendor/shifted-clothing-commerce-sdk-0.12.1.tgz
# Windows (PowerShell)
Get-FileHash vendor/shifted-clothing-commerce-sdk-0.12.1.tgz -Algorithm SHA256
```

The output must equal the SHA-256 above. It is also asserted by `src/sdk-artifact.test.ts` (version,
relative `file:` spec, and byte-for-byte SHA-256).

### Update the SDK artifact

1. Drop the new packed tarball into `vendor/` (e.g. `...-sdk-0.12.1.tgz`).
2. Point the dependency at it: `"@shifted/clothing-commerce-sdk": "file:vendor/shifted-clothing-commerce-sdk-0.12.1.tgz"`.
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

| Method                             | Endpoint                                 | Used by                          |
| ---------------------------------- | ---------------------------------------- | -------------------------------- |
| `getContext()`                     | `GET /me/context`                        | session bootstrap / access flags |
| `listProducts()`                   | `GET /products`                          | Products list                    |
| `getProduct(productId)`            | `GET /products/{id}`                     | Product management (read)        |
| `createProduct()`                  | `POST /products`                         | Create product                   |
| `updateProduct()`                  | `PATCH /products/{id}`                   | Edit details                     |
| `setProductStatus()`               | `POST /products/{id}/status`             | Lifecycle (draft/active/archive) |
| `publishProduct()`                 | `POST /products/{id}/publish`            | Publish to Storefront            |
| `unpublishProduct()`               | `POST /products/{id}/unpublish`          | Unpublish from Storefront        |
| `createVariant()`                  | `POST /products/{id}/variants`           | Add variant                      |
| `setVariantPrice()`                | `POST /variants/{id}/price`              | Set selling price                |
| `createProductMediaUploadIntent()` | `POST /products/{id}/media/intent`       | Media: authorize upload          |
| `registerProductMedia()`           | `POST /products/{id}/media`              | Media: register uploaded image   |
| `archiveProductMedia()`            | `POST /products/{id}/media/{id}/archive` | Media: soft-archive              |
| `listInventory()`                  | `GET /inventory`                         | Inventory                        |
| `receiveInventory()`               | `POST /inventory/receipts`               | Receive stock                    |
| `adjustInventory()`                | `POST /inventory/adjustments`            | Adjust / reconcile               |
| `transferInventory()`              | `POST /inventory/transfers`              | Transfer stock                   |
| `listOrders()`                     | `GET /orders`                            | Orders list                      |
| `getOrder(orderId)`                | `GET /orders/{id}`                       | Order Detail                     |
| `listPromotions()`                 | `GET /promotions`                        | Promotions list                  |
| `getPromotion()`                   | `GET /promotions/{id}`                   | Promotion detail/edit load       |
| `createPromotion()`                | `POST /promotions`                       | Create Promotion                 |
| `updatePromotion()`                | `PATCH /promotions/{id}`                 | Edit permitted fields            |
| `setPromotionStatus()`             | `POST /promotions/{id}/status`           | Activate/deactivate              |
| `createPromotionCode()`            | `POST /promotions/{id}/codes`            | Create code/voucher              |
| `setPromotionCodeStatus()`         | `POST /promotions/codes/{id}/status`     | Disable code                     |

The public Storefront reads (`listPublishedProducts` / `getPublishedProduct`) are on the **root**
client (unauthenticated, tenant supplied as a query parameter), not the tenant-scoped client.

Each write additionally sends an `Idempotency-Key` header (owned by the SDK); the app supplies the key
value. The one exception is `createProductMediaUploadIntent`, which by contract carries **no**
idempotency key (it mints a fresh server-controlled destination and is safe to repeat). Endpoint paths
above are illustrative of the method→operation mapping; the SDK owns the exact routing.

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

All read surfaces reuse one tenant-scoped client and one **read** request lifecycle (`useAsync`,
below). Products and Orders expose no mutation control; Inventory adds the three write operations
documented under [Inventory operations](#inventory-operations-phase-2g), which use a separate, explicit
**write** lifecycle (`useMutation`) — reads are never forced through the write hook or vice versa.

### Products

```
authenticated session → tenant → listProducts() → Products list
real product id       → getProduct(productId)    → Product management (read + writes)
```

- **Products list** (`src/products/ProductsListScreen.tsx`): states — loading, populated, legitimate
  empty, no-access (no `catalog.read`), API 403, network/API error, explicit retry. Rows navigate by
  the real product id. Brand names are resolved from `/me/context`. Adds a **Create product**
  affordance (hidden when no brand is accessible) and an at-a-glance session-observed Storefront state
  per row.
- **Product management** (`src/products/ProductManageScreen.tsx`): the read baseline (variants,
  options, prices) plus the catalog write workflow — see [Catalog management](#catalog-management-phase-2k).
- No mock fallback.

### Inventory

```
authenticated session → tenant → listInventory() → complete authorized inventory read
```

- Fields used from the read contract: `productName`, `sku`, `onHand`, `version`, and
  `inventoryLocationId`.
  Location **names** are resolved from `/me/context → access.inventory.locations` (the inventory
  item itself carries only the location id). Available / reserved / allocated quantities are not in
  the current read contract and are not displayed. SDK 0.3.1 does expose the authoritative optimistic-
  concurrency `version`, which is used by Adjust (see below).
- **Cursor pagination:** the screen loads the **complete** authorized inventory via the shared
  `collectAllPages` helper (`src/commerce/pagination.ts`) — it follows the server's `nextCursor` in
  server order, page one is never presented as the whole list, and there is a finite maximum-page
  safety bound.
- **Fail-closed cap:** if the client reaches its maximum permitted page count while the server still
  reports additional pages, it throws `PaginationCapExceededError` and the screen shows an error
  state (with retry) rather than presenting partial inventory as complete.
- Zero balances render honestly as `0`. The read itself performs no mutation; the write operations
  below are separate, explicitly authorized actions.

## Catalog management (Phase 2K)

The Products area is a full management workflow (`src/products/CreateProductScreen.tsx`,
`src/products/ProductManageScreen.tsx`, and the pure `src/catalog/*` modules). Every action is a pure
SDK 0.8.0 call through the tenant-scoped client — no direct `fetch` (except the signed storage PUT), no
local business math, no mock fallback — and each write re-reads the authoritative product on success.

### Create and edit

- **Create** captures only the canonical contract fields: `brandId`, `name`, `slug` (required),
  `styleCode?`, `description?`. The slug auto-derives from the name (`slugify`) until edited. Products
  are created as **draft**.
- **Edit** (`updateProduct`) changes name/slug/style code/description.
- Typed conflicts are mapped, not collapsed: `SLUG_CONFLICT`, `STYLE_CODE_CONFLICT` (editable),
  validation, authorization, and ambiguous-network (retryable with the same key).

### Lifecycle vs Storefront publication (two distinct states)

Internal lifecycle (**draft / active / archived**, via `setProductStatus`) is **separate** from
Storefront publication (**unpublished / published**, via `publishProduct` / `unpublishProduct`). The UI
shows both as distinct badges and states this explicitly — a product can be active but not published.
Only valid transitions are offered (the server still authoritatively rejects the rest with
`INVALID_LIFECYCLE_TRANSITION`, mapped to a refresh recovery). **Archiving is not a delete** — it is a
two-step confirm and the product is retained and restorable to draft.

### Variants and prices

- `createVariant({ productId, sku, displayName? })`; `SKU_CONFLICT` is mapped to an editable message.
- Selling prices use **integer-minor-unit safe conversion** (`src/catalog/money.ts`): a decimal input
  like `25.99` is converted to `2599` minor units with pure integer/string math — **never** floating
  point. Currency is shown explicitly (defaulted from the product's existing price currency, never a
  hidden hardcode). `setVariantPrice` records canonical price history server-side; the client never
  edits rows directly.

### Media upload (real Phase 2J flow)

`src/catalog/media.ts` implements the contract flow: **(1)** request an authorized upload intent
(`createProductMediaUploadIntent`) → **(2)** PUT the selected image bytes to the server-issued signed
URL → **(3)** register the metadata (`registerProductMedia`) against the same server-controlled
bucket/path → **(4)** refresh. Steps 1–2 are not idempotency-keyed (the intent mints a fresh
destination); step 3 is the keyed, retryable step (an ambiguous retry re-sends the identical
bucket/path). Raw images never touch the API database, and the app never uploads to a client-chosen
path. Media can be soft-archived (`archiveProductMedia`), with a confirm.

If the API authorizes an intent but storage returns **no signed URL** (local dev without Supabase
Storage credentials), that single step is isolated as a clear "storage-configuration gap" — everything
before and after (authorization, register) is still proven. This is the only environmentally-gated part
of the workflow.

### Session-observed publication state and slug (contract note)

`GET /products/{id}` returns id/name/styleCode/status, variants, options and prices — but **not** the
Storefront publication state, slug, or description. Those are surfaced from **this session's
observations** (`src/catalog/observations.ts`), fed by write responses (create/status return
`storefrontStatus`; publish/unpublish return it and `publishedAt`; the slug is the one we sent). Where
nothing has been observed, the UI honestly says "Storefront state not observed this session" rather
than guessing. This mirrors the deliberate inventory `version` pattern and keeps the server
authoritative. The full published projection is verifiable via the public Storefront API
(`listPublishedProducts` / `getPublishedProduct`).

### Permission-aware UX (catalog)

Unlike inventory (`access.inventory.write.*`), the catalog access context exposes **only** `canRead`
(plus `tenantWide` and `brands[]`) — there is **no** author/publish capability flag. So author-vs-
publish cannot be pre-distinguished from capability data; the app relies on the server as the sole
authority and maps a real `403` to an explicit **"Not authorized — nothing was applied"** state. Role
names grant nothing here. The Create affordance is hidden only when no brand is accessible (never
guessing a brand id).

### Single/multi-brand (frozen invariant)

`src/catalog/brands.ts` honours the invariant: a **single-brand** tenant is used directly (never forced
through a switcher); a genuinely **multi-brand** tenant must pick an explicit brand for a new product;
with **no** accessible brand, authoring is disabled (no guessed brand id).

### Catalog error model

`src/catalog/write-errors.ts` maps stable API codes to distinct, useful recoveries — never a generic
"something went wrong":

| Code / condition                                                                                                 | Recovery         |
| ---------------------------------------------------------------------------------------------------------------- | ---------------- |
| `SLUG_CONFLICT`, `STYLE_CODE_CONFLICT`, `SKU_CONFLICT`                                                           | edit             |
| `PRODUCT_NOT_PUBLISHABLE` (with prerequisite explanation)                                                        | edit             |
| `INVALID_LIFECYCLE_TRANSITION`, `PRODUCT_PUBLISHED`, `PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND`, `MEDIA_NOT_FOUND` | refresh          |
| validation / bare 400                                                                                            | edit             |
| `IDEMPOTENCY_CONFLICT`, auth (401), forbidden (403)                                                              | none             |
| network / 5xx (ambiguous)                                                                                        | retry (same key) |

## Inventory operations (Phase 2G)

Three authorized write operations extend the Inventory surface
(`src/inventory/InventoryOperations.tsx`). They are pure SDK 0.3.1 calls — no direct `fetch`, no local
balance math, and no mock fallback. Variant choices come from the **real loaded inventory** and
locations come from `/me/context` (no hardcoded location ids anywhere in production logic).

| Operation    | Meaning                                           | SDK call                                                                                                       |
| ------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Receive**  | Physical stock arrived into a location            | `receiveInventory({ variantId, inventoryLocationId, quantity, note? })`                                        |
| **Adjust**   | Reconcile system on-hand to a physical **count**  | `adjustInventory({ variantId, inventoryLocationId, countedQuantity, expectedVersion, note? })`                 |
| **Transfer** | Move stock between two locations in one atomic op | `transferInventory({ variantId, sourceInventoryLocationId, destinationInventoryLocationId, quantity, note? })` |

- **Receive** takes a positive quantity. Its response returns `observedOnHand` / `observedVersion`
  (post-commit observed state), which may be displayed in the success result; the refreshed list is
  the source for subsequent operations.
- **Adjust is a reconciliation, not a `+/-` delta.** The operator states the actual physical count and
  the API derives the delta under a row lock. It is guarded by `expectedVersion` (optimistic
  concurrency). SDK 0.3.1 supplies `InventoryListItem.version`, so Adjust is available immediately
  after a normal fresh Inventory load and sends that row version as `expectedVersion`; no prior write
  is required. A `0` count is valid (reconcile to empty).
- **Transfer** blocks an obviously invalid source == destination locally (the chosen source is disabled
  in the destination list) and the API also rejects it (`SAME_TRANSFER_LOCATION`). Its response
  reports both sides' observed on-hand/version.
- After every successful write the screen **refreshes Inventory from the server** — the on-screen
  balances are the authoritative re-read, never a locally computed final number. For a Transfer, the
  refresh shows both the source decrease and the destination increase.

### Idempotency and retry semantics

Every write carries an `Idempotency-Key`. The lifecycle lives in `src/ui/useMutation.ts` and
`src/inventory/idempotency.ts`:

- A **new operation** mints one fresh key (a secure v4 UUID from `expo-crypto`), then submits it.
- An **ambiguous network failure** offers **Retry**, which reuses the **same** key — so a request that
  may already have been applied is never applied twice (at-most-once at the API).
- **Success**, **reset**, or starting the **next** operation mints a **new** key.
- Keys are never regenerated on render or on retry, never hardcoded, and never derived from weak
  randomness. Duplicate taps are ignored while a request is in flight, and a stale response from an
  abandoned/reset operation can never overwrite a newer one.

### Concurrent-adjustment behavior

If a reconciliation's `expectedVersion` is stale, the API returns `409 CONCURRENT_MODIFICATION`. The
app does **not** blindly retry (that would resubmit the same stale version). It immediately abandons
the stale operation/key and entered count, refreshes Inventory, and tells the operator to review the
new authoritative on-hand/version and enter the physical count again. Reconfirmation starts a new
operation with a new idempotency key and the refreshed row version.

### Authorization: UX visibility vs API authority

`/me/context → access.inventory.write` supplies top-level `canReceive`, `canAdjust`, and `canTransfer`
guidance plus per-location receive, adjust, transfer-origin, and transfer-destination flags. The app
uses those exact values for action visibility and option filtering; it never infers permission from a
role name or from read access. This context is UX guidance only: **the API is the sole authority**, and
a real `403` still surfaces as access denied. Opening Stock and Generic Issue are never rendered.

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
  errors; sign-out removes authenticated management surfaces; signing in again re-bootstraps.

### Phase 2G inventory-write acceptance

With the Phase 2G identity (holds `inventory.receive` / `adjust` / `transfer`; **no** opening/issue)
and the two dev stockrooms, from Inventory:

1. **Read the authoritative starting on-hand first** (do not assume `22 / 39 / 12` if prior manual
   activity occurred).
2. **Receive** a small quantity into `Dev Flagship Stockroom`; after the auto-refresh, confirm the row
   increased by exactly that amount.
3. **Adjust** a normal freshly loaded row (without first writing it to discover a version) to a
   specific physical count; confirm the refreshed on-hand equals the submitted count.
4. **Transfer** a small quantity Flagship → Overflow; confirm the refreshed source decreased and
   destination increased by exactly that amount.
5. **Idempotency:** replaying the same operation with the same key does not apply twice (Retry after an
   ambiguous failure reuses the key).
6. Confirm no Opening Stock / Issue actions, no request loop, no "Maximum update depth", and that a
   denied write would show an explicit access-denied state.

Authenticated runtime acceptance completed on **2026-09-04** against the local API and the real Clerk
development user:

- Receive at Dev Overflow Stockroom: `5 + 2 = 7`; exact same-key replay remained `7`.
- Fresh-load Adjust at Dev Flagship Stockroom, `DEV-LS-001-L`: row version `3`, on-hand `38`, counted
  `37`, authoritative result `37`.
- Transfer `DEV-LS-001-M`, Flagship → Overflow: `21 / 7`, moved `1`, authoritative result `20 / 8`.
- Both locations were receive/adjust/transfer-origin/transfer-destination capable in context; all
  three actions and filtered choices matched it. Products, Product Detail, Inventory, Orders, Order
  Detail, and partial fulfillment progress passed with no unexpected console or HTTP errors.

### Phase 2K catalog-management acceptance

With the local API + a Clerk dev login (a manager membership holding catalog author/publish), from
Products:

1. **Create** a product (brand auto-used if single; chosen if multi); confirm it lands as **draft**.
2. **Add a variant** (SKU) and **set a selling price** (decimal input → exact minor units, explicit
   currency).
3. **Activate** the product (internal status), noting this is distinct from publication.
4. Exercise the **media** flow as far as storage config allows: choose → upload (signed URL) → register
   → the image appears; a missing signed URL is isolated as a storage gap.
5. **Publish**; confirm the Storefront badge/summary reflects `published`. If not publishable, confirm
   the `PRODUCT_NOT_PUBLISHABLE` explanation (needs active product + active variant + valid price).
6. Verify the product appears through the **public Storefront API** (`listPublishedProducts` /
   `getPublishedProduct`).
7. **Update** the product/price; confirm the public projection updates.
8. **Unpublish**; confirm it disappears publicly while the canonical product remains manageable.
9. Confirm at least one **authorization-denied** write surfaces "Not authorized — nothing was applied".

**Runtime state proven from this environment (2026-09-17):** the local Phase 2J API (`/health` ok,
version `0.1.0`) has all seven authenticated catalog endpoints wired and enforcing auth — via the SDK
0.6.0 boundary, unauthenticated `createProduct` / `updateProduct` / `setProductStatus` /
`publishProduct` / `createVariant` / `setVariantPrice` / `createProductMediaUploadIntent` all return
`401 UNAUTHENTICATED`, and the public `listPublishedProducts` returns a schema-valid `{ products: [] }`.
The **interactive Clerk-authenticated** create→publish→storefront walkthrough (steps 1–9) is a manual
step: this environment cannot mint a live Clerk session JWT or drive interactive mobile login (same
constraint documented for Phase 2G). All catalog behaviors were otherwise proven by the test suite
against the real SDK 0.6.0 types.

## Troubleshooting

- **"EXPO_PUBLIC_COMMERCE_API_URL is not configured"** — set it in `.env`. There is no fallback by
  design.
- **"Clerk is not configured"** — set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env`.
- **"Cannot reach the Commerce API"** — the API URL is unreachable from the device; the app does not
  substitute mock data.
- **`integration:check` fails with `ECONNREFUSED`** — expected unless a Commerce API is actually
  running at `EXPO_PUBLIC_COMMERCE_API_URL`.
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

The writes are the catalog operations (Create / Edit / Lifecycle / Variants / Prices / Media /
Publish), Inventory **Receive / Adjust / Transfer**, and Supplier **create / edit / activate–deactivate**
plus optional supplier-linked receiving (Phase 2N, integrated on SDK 0.9.0). **Staff management (Phase
2O) is integrated on SDK 0.10.0** — add-staff (link existing identity by exact-email lookup), membership
lifecycle, and role+scope assign/unassign, with anti-escalation / last-admin surfaces. Order and
fulfillment mutations, payments, refunds/returns, customer
management, live reporting transport/analytics aggregation, taxonomy (category/collection) writes, website
layout editing, POS, storefront checkout, and cart are **out of scope** and not implemented here. Supplier **unit cost / cost-basis**
accounting and procurement (Purchase Orders, RFQs, invoices, Accounts Payable, approvals, portal,
payments) plus permanent supplier deletion are explicit **non-goals**. The catalog UX is left extensible
for a future additive taxonomy slice.
