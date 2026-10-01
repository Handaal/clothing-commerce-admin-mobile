# Admin Mobile Architecture

```text
Clerk (auth, owned by Mobile)
  │  getToken callback (token only — never a Clerk object)
  ▼
@shifted/clothing-commerce-sdk 0.13.1  (packed tarball under vendor/, relative file: path)
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

## Phase 2Q Admin reporting (SDK 0.13.1)

Reporting presentation depends only on the Admin-owned `ReportingAdapter` and normalized view-models in
`src/reporting`. `resolveReportingAdapter` binds the SDK summary/sales/products/inventory/returns/
promotions/suppliers methods and localizes every wire DTO mapping there. Screens build no URL and import
no API source. Missing `access.reports?.canRead` guidance still fails closed; the API reauthorizes every
request.

The UI treats date presets as tenant-local reporting intent; custom inputs are validated only as ordered
calendar dates. The service supplies timezone, inclusive/exclusive range boundaries, and trend bucket
starts. Monetary view-models carry a currency on every applicable group/row and are rendered separately, never
summed across currencies. Cursor page controls request one bounded page at a time and retain only a short
back-navigation cursor stack; they do not download or aggregate history.

The same adapter binds SDK 0.13.1 `exportReport` for exactly four datasets: `sales-products` (with the
selected Product/Variant level), `inventory-movements`, `returns`, and `supplier-receipts`. Dashboard and
Promotion export do not exist. `src/reporting/export-document.ts` is the one save/share boundary: web
downloads a Blob; native writes the unchanged SDK body to Expo cache under the unchanged SDK filename and
opens the Expo share sheet with the unchanged media type. No CSV parsing, quoting, date rewriting,
truncation, PDF/XLSX, generic builder, valuation, supplier cost, or client-side row export exists.

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
| Routes: Reporting (2Q)                | `app/reports/{index,sales,products,inventory,returns,promotions,suppliers}.tsx`                                |
| Reporting + export boundary (2Q)      | `src/reporting/*`                                                                                              |

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
19. Reporting components consume only normalized Admin view-models; currency groups remain separate and
    time boundaries are displayed exactly as supplied, never converted into client-derived business
    days. CSV export uses only SDK `exportReport` for the four canonical datasets and passes its body,
    filename, and media type unchanged to the platform save/share boundary.

## Phase 2S-F2 durable inventory mutation recovery

The three high-risk inventory writes (Receive — including a supplier-linked receipt — Adjust, and
Transfer) previously held their idempotency key only in React memory (`useMutation`'s refs). If the
response was lost and the app was restarted or the operations surface remounted, that key was gone:
the server had committed the mutation but the client, unable to replay the lost key, would mint a new
one and apply the command a second time. This phase makes those commands **crash-durable** so a
lost-response command is recovered and replayed with its original key (at most once), never silently
duplicated. Nothing else in Admin is journaled in this phase.

Design (`src/inventory/journal/`):

1. **Durable journal, not refs.** `InventoryJournal` (over a `JournalStore`) is the source of truth for
   in-flight command identity. The device backend is `localStorage` on web and a JSON file in the
   persistent document directory on native (`createDurableJournalStore`), both surviving an app/process
   restart; a memory store backs tests only. (Phase 2S-F4 makes storage fail-closed: there is no
   production memory fallback.) `InventoryScreen` creates the journal once and passes it to
   `InventoryOperations`.
2. **Persist before transport.** `useJournaledInventoryMutation` writes the command — normalized payload,
   idempotency key, tenant/context, prepared timestamp, lifecycle status — to the journal (`prepared`)
   _before_ any request, moves it to `sent` at dispatch, then to `accepted` (with the canonical server
   response) once resolved. The key is minted once, in the journal, and reused verbatim on every replay.
3. **Result classification.** An ambiguous outcome (transport/5xx → the write-error `retry` recovery)
   leaves the command unresolved so it can be replayed; every definitive rejection (validation, business,
   auth, stale-version) did not apply. (Phase 2S-F4 keeps a rejection as a `rejected` entry shown until
   dismissed, rather than deleting it.) A command is `acknowledged` (pruned) only once the operator has
   explicitly acknowledged its resolution.
4. **Equivalence dedupe.** `prepare` reuses the existing key for an equivalent, still-unresolved command
   (same normalized payload identity) rather than minting a second key — so a repeated equivalent intent
   can never become a second mutation. A recount against a new `expectedVersion` is a genuinely new
   command, not an equivalent repeat.
5. **Recovery surface.** On the inventory operations surface (startup/remount) `InventoryRecoveryPanel`
   lists every unresolved command for the tenant and requires an explicit resolution: replay reuses the
   original key/payload and reconciles the canonical server response; an idempotent server dedupes it so
   stock changes exactly once. A replay rejected as an idempotency conflict is shown and discarded, never
   silently reapplied. Unrelated read-only Admin work stays fully usable while the panel is shown.
6. **Supplier receipts share the journal.** A supplier-linked receipt is the same receive command with
   `supplierId`/`supplierReference` in the persisted payload — no parallel system — and that metadata is
   replayed verbatim on recovery.

Tenant isolation: every journal read/write is filtered by owner (see Phase 2S-F4), so one owner's
unresolved commands are never visible to, or replayable in, another.

## Phase 2S-F4 inventory recovery journal hardening

Phase 2S-F4 closes four confirmed P1 defects in the merged F2 journal. The journal format is bumped to
**v2** (membership-scoped, owner-namespaced storage); the released v1 journal is never silently adopted.

1. **Accepted survives until acknowledged (lifecycle).** The lifecycle is now
   `prepared → sent → (accepted | rejected) → acknowledged`. `accepted` is _resolved but not terminal_:
   it survives a restart and stays visible in the recovery surface until the operator explicitly
   acknowledges it — there is no startup auto-prune of accepted results (`findRecoverable` returns every
   not-yet-acknowledged entry; nothing is pruned on load). A definitive rejection becomes `rejected`
   (kept, shown, dismissed deliberately) rather than being deleted, so nothing silently vanishes. Only an
   explicit acknowledgement deletes an entry, and the journal **refuses to acknowledge an unresolved
   command** — removing the old unsafe "Discard without completing", since an ambiguous command's durable
   key is the only identity for a mutation the server may already have committed.

2. **Fail-closed durable storage.** `createDurableJournalStore` never degrades to memory. A failed write
   (quota, disabled storage, native I/O) throws `JournalStorageError`; unreadable/corrupt content throws
   `JournalCorruptError` and is **preserved** (web: original key intact plus a `.corrupt` copy; native: a
   `.corrupt` sibling copy) — corruption is never coerced into an empty journal. The write hook persists
   `prepared` _before_ transport and treats any durability failure as a blocking state: **the API is
   never called** when the durable prepare could not be secured. The in-memory store remains available
   only for tests/explicit DI.

3. **Crash-safe native write.** The native file is written through a temp copy before replacing the live
   file. (Phase 2S-F6 replaces this with a three-generation protocol — see below — because an Expo
   overwrite-move is **not** atomic: it deletes the destination first, so a crash mid-move could erase
   the only copy.)

4. **Serialized journal transitions.** Every write — `prepare`, `markSent`, `recordAccepted`,
   `recordRejected`, `acknowledge`, and recovery-panel replays — runs through a shared async mutex,
   eliminating the lost-update window where two overlapping forms (Receive + Adjust, Transfer + Supplier
   Receive, or a recovery replay overlapping a new prepare) could clobber each other's whole-document
   write and lose an entry. (Phase 2S-F6 lifts this lock above the journal instance so it is shared
   per-namespace across remounts and browser tabs — see below.)

5. **Transition invariants.** Each transition verifies the target entry exists, is owned by this journal
   (tenant **and** membership), and is in a status that permits the change; otherwise it throws
   `JournalTransitionError`. Transport never continues if the durable record unexpectedly disappeared,
   and a missing entry is never silently reconstructed under a new key.

6. **Membership-scoped ownership.** Journal ownership is `{ tenantId, membershipId }`, using the
   canonical `/me/context` `membership.id` — the same actor fingerprint the API scopes inventory
   idempotency to (never email/display name). Storage is owner-namespaced: web key
   `admin-mobile.inventory-journal.v2.<tenant>.<membership>`, native file
   `inventory-journal.v2.<tenant>.<membership>.json`. On a user switch the journal is recreated for the
   new owner, so one user never sees, replays, acknowledges, or deletes another's unresolved commands,
   and the originating user recovers them on return.

7. **V1 quarantine.** The released v1 journal (no membership owner) is detected per tenant
   (`readLegacyV1Unresolved`) and **never auto-claimed or replayed**. Unresolved v1 entries block new
   inventory mutations behind a non-destructive notice until the operator explicitly archives them
   (`quarantineLegacyV1` preserves the v1 data under a `.quarantined` key/path, never deleting it).

8. **Equivalent-intent UX.** Submitting a form whose normalized intent matches an already-unresolved
   command does not look like a fresh send: it is blocked (`pending-equivalent`) and the operator is
   pointed at the existing recovery entry. No second key is ever minted.

9. **Recovery / storage UX.** `InventoryRecoveryPanel` distinguishes prepared vs sent/ambiguous (exact
   retry only), accepted (confirmed — shows "Applied", awaiting acknowledgement), and rejected (kept
   until dismissed). Corruption/storage failures and legacy quarantine render blocking, non-destructive
   notices and hide the write forms (via `onAvailabilityChange`) while read-only inventory stays usable;
   raw filesystem/localStorage errors are never shown (dev-only logging).

## Phase 2S-F6 journal durability — generation protocol, namespace locking, strict validation

Phase 2S-F6 closes four follow-up P1s that an independent verification found in F4.

1. **Native generation protocol (not atomic move).** An Expo overwrite-move deletes its destination
   first, so the F4 temp→move promotion had a crash window that could erase the only journal. The native
   store (`createGenerationStore`, over an injectable `GenerationFs` seam) now keeps **three physical
   generations** — `main`, `backup`, `temp` — each a complete copy carrying a monotonic `generation`.
   Write (new generation `G = max valid generation + 1`): (1) write the full new content to `temp`;
   (2) validate `temp`; (3) if `main` is valid, copy it to `backup` _before_ `main` is touched;
   (4) write the new content over `main`; (5) validate `main`; (6) only then remove the now-stale `temp`
   and `backup`. The invariant is that **at every interruption point at least one complete, valid
   generation survives** (a crash between 4 and 5 leaves `temp` = G and `backup` = G-1). Startup recovery
   independently validates every surviving generation and returns the one with the **highest generation**
   (ties: `main` > `temp` > `backup`); reads NEVER delete anything (a stale `temp` is never removed before
   a valid generation is chosen), and if files exist but none is valid the bytes are preserved and
   `JournalCorruptError` is thrown — never an empty journal.

2. **Namespace-scoped coordinator (+ web cross-tab).** Serialization is lifted above the `InventoryJournal`
   instance into a module-level registry keyed by `(tenant, membership)` (`getNamespaceCoordinator`), so a
   screen that remounts a brand-new journal over the same namespace shares one effective lock with the
   old instance. On web each critical section is additionally wrapped in a `navigator.locks` request named
   per namespace, serializing two browser tabs; where Web Locks is unavailable the in-process mutex still
   protects a single runtime (cross-tab coordination is simply not offered, never silently faked).

3. **Strict whole-document validation.** The persisted parser (`parsePersisted`) is strict: any single
   defect — bad `version`/`generation`, a malformed or impossible entry (unknown status/operation, missing
   tenant/membership/key, bad timestamp, invalid quantity/version, wrong payload shape), a duplicate key,
   an illegal status/result combination (`accepted` without a result, `prepared` carrying one), or a
   payload whose **recomputed identity** does not match the stored `payloadIdentity` — makes the WHOLE
   document corrupt (`JournalCorruptError`). Entries are never silently filtered out. Recomputing the
   identity from the stored payload prevents a damaged payload from being replayed under a stale key.

4. **V1 blocks on all non-terminal evidence + fail-closed init.** Legacy V1 detection now blocks on any
   non-acknowledged V1 entry for the tenant — including `accepted` (a committed, un-acknowledged legacy
   mutation) and unknown statuses — and treats an unreadable or malformed V1 journal as blocking evidence
   (never "no journal"). The Inventory write surface starts with writes **unavailable** and only enables
   the forms after the V2 store has validated AND the V1 check has completed with no blocking state, so
   there is no startup window in which a mutation could be submitted. A storage-unavailable namespace
   hides ALL write forms for that owner (read-only inventory stays usable).

5. **Transition identity (P2).** The lifecycle is strict `prepared → sent → (accepted | rejected)` — a
   result is only recorded for a command that was actually dispatched. Transitions additionally accept an
   `expectedIdentity` (the caller's payload fingerprint); a mismatch fails the transition, so a transition
   can never mutate a row whose stored payload has diverged.

6. **`supplierReference` (P2).** `normalizeReceivePayload` now keeps a document reference whenever
   provided, independent of `supplierId`, matching the canonical API input (the UI is unchanged).

## Phase 2S-F8 journal durability — authoritative-slot writes, safe generations, cross-context safety

Phase 2S-F8 closes five follow-up P1s an independent verification found in the merged F6 hardening, plus
the cheap adjacent P2s. It does **not** claim any single filesystem operation is atomic; every guarantee
below holds across truncate-then-fail, partial-write, and delete-then-fail interruptions (the fault
injection the fake `GenerationFs` now models).

1. **Authoritative-slot-aware native writes (P1-1).** The F6 write always staged into `temp` first, so
   when `temp` was the _only_ valid generation (main missing/corrupt) the very next write overwrote the
   only good copy. The native `createGenerationStore` write now **inspects and validates every slot
   first**, identifies the authoritative (highest-generation) valid copy, and preserves it in `backup`
   _before_ disturbing whichever slot holds it — only then does it stage into `temp` and publish into
   `main`. The invariant is strengthened to hold **at every individual filesystem-operation boundary, at
   least one complete valid copy (the old authority or the new generation) survives**, regardless of which
   slot was authoritative. In particular a temp-only authority is copied to `backup` before `temp` is
   ever overwritten, so the "next write destroys the only copy" window is gone.

2. **Safe-integer generation rules (P1-2).** A persisted `generation` must be a non-negative
   `Number.isSafeInteger`; `1e308`, `NaN`, negative, and fractional values are corruption. The counter is
   advanced through `nextGeneration`, which **fails closed** with `JournalGenerationExhaustedError` at
   `Number.MAX_SAFE_INTEGER` rather than wrapping or silently reusing a generation (a reused/wrapped
   generation could let a stale or half-written copy outrank or masquerade as the authoritative one).
   `serializePersisted` also refuses to write an unsafe generation. Payload counts/versions
   (`quantity`, `countedQuantity`, `expectedVersion`) likewise require safe integers (P2-B).

3. **Equal-generation divergence fails closed (P1-2/§3a).** When two or more valid slots share the
   _highest_ generation, identical contents are accepted and resolved deterministically by slot priority
   (`main` > `temp` > `backup`) — the benign aftermath of a crash between publish and cleanup. But if the
   contents **differ**, that is interrupted/corrupt persistence and the read fails closed
   (`JournalCorruptError`) instead of arbitrarily preferring `main`.

4. **Web Locks required for web inventory mutation (P1-3).** On web the journal lives in a `localStorage`
   namespace shared by every tab, so safe serialization of whole-document writes **requires the Web Locks
   API**. `isCrossContextSafe()` reports the capability (always true on native — one JS runtime). When it
   is false (web without Web Locks) the app **fails closed**: high-risk mutations and recovery
   replays/acknowledgements are disabled behind an actionable compatibility notice, while read-only
   inventory — and a read-only listing of unfinished operations — stay available. There is no silent
   fallback to an in-process-only lock for durability on web.

5. **V2 namespace-owner validation (P1-4).** `parsePersisted` now takes the expected `{ tenantId,
membershipId }` owner and requires **every** persisted entry to match it exactly. A foreign-owner entry
   makes the whole document corrupt for that namespace (fail closed); it is never parsed-then-filtered to a
   misleading empty journal. The web store and every native slot read validate against the expected owner.

6. **Strict V1 semantic blocking (P1-5).** Legacy V1 detection parses strictly: the document must be an
   object with the exact `version` 1 and an `entries` array (missing/wrong version, unreadable, or a
   `getItem` that throws all block). Each entry needs a non-empty string `commandKey`, `tenantId`, and
   `status`; a malformed/non-attributable entry blocks regardless of tenant. For a well-formed entry of
   this tenant, only a provably safe status (`acknowledged`) is non-blocking — `prepared`/`sent`/
   `accepted`/`rejected` and any unknown status block. Malformed evidence is never discarded.

7. **Namespace-wide post-init failure UX (P2-A).** A durability failure proven _during_ a submit (not just
   at startup) is namespace-wide: `InventoryOperations` hides **all** write forms behind one global notice
   (not merely the form in use), while read-only inventory stays usable. Combined with the fail-closed
   startup gate, there is never a frame in which a mutation can be submitted against an unsecured journal.

8. **Adjacent P2s.** Transfer still rejects an identical source/destination client-side
   (`validateTransferLocations`, matching the API's `SAME_TRANSFER_LOCATION`); a persisted
   `supplierReference` must be meaningful text (a blank/whitespace value — which the normalizer would omit
   — is corruption, P2-D).

## Phase 2S-F10 journal fail-closed enforcement at the boundary

Phase 2S-F10 closes the final two P1s: the earlier no-Web-Locks protection was only UI-deep, and V1
parsing still had a whitespace/tenant-routing fail-open. No accepted area (generation protocol,
safe-generation arithmetic, equal-generation handling, V2 owner validation, lifecycle, payload identity,
`supplierReference` contract) is redesigned.

1. **Capability enforced at the journal boundary, not the UI (P1-1).** On web the journal lives in a
   shared `localStorage` namespace, so without the Web Locks API two tabs could race the whole-document
   journal. `createInventoryJournal` now takes an injected `crossContextSafe` (default
   `isCrossContextSafe`) and **every mutating operation — `prepare`, `markSent`, `recordAccepted`,
   `recordRejected`, `acknowledge` — rejects with `CrossContextLockUnavailableError` before any persistent
   write** when it is false. `quarantineLegacyV1` is gated the same way. Read-only operations (`read`,
   `findRecoverable`, `findEquivalentUnresolved`, `get`, legacy detection) are never gated. Native (one JS
   runtime) is unaffected. The UI visibility check is now secondary defence; `isDurabilityFailure` treats
   the new error as a fail-closed durability failure. The recovery panel's **legacy branch** no longer
   renders an enabled "Archive and continue" when Web Locks are unavailable — it shows the evidence
   read-only with an explanation, fixing the branch-ordering bypass.

2. **Strict V1 validation precedes tenant routing (P1-2).** `classifyLegacyV1Entry` validates the entire
   entry on **trimmed** values (a whitespace-only `commandKey`/`tenantId`/`status` is malformed, not a
   sneaky "different tenant") and classifies the status against the frozen V1 lifecycle **before** any
   tenant comparison. Malformed or unknown-status evidence is non-attributable and **blocks regardless of
   the tenant it claims**; only a well-formed, known-status entry is routed by tenant, and for this tenant
   only `acknowledged` is safe. Malformed evidence can therefore never produce an empty blocking set.

(Deferred P2: a storage failure _during_ `recordAccepted`/`recordRejected`/`acknowledge` — i.e. after a
successful transport — is still best-effort logged rather than flipping the namespace unavailable, because
doing so safely without hiding a genuine success needs more than a local callback; the pre-transport
paths already fail closed namespace-wide.)

## Phase 2S-F2 Settings topology error UX

The Settings write boundary in the Commerce API now returns four stable operational-topology conflict
codes. `describeSettingsError` maps each to distinct, actionable guidance (kind `topology-conflict`)
without ever leaking the backend code, mirroring — never restating — the server rule:

- `STOREFRONT_LOCATION_NOT_OPERATIONAL` — enabling cash-on-delivery needs an active, sellable,
  fulfillment-enabled location under an active brand.
- `REGISTER_LOCATION_NOT_OPERATIONAL` — activating a register needs an active branch and an active,
  fulfillment-enabled default location.
- `STOREFRONT_DEPENDENCY_CONFLICT` — a location/brand is required by an enabled storefront; disable or
  reroute the storefront before deactivating it or removing sellable/fulfillment capability.
- `REGISTER_DEPENDENCY_CONFLICT` — a branch/location is required by an active register; deactivate the
  register first.
