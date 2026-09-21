# Phase 2N — Supplier management

**Status: integrated against the real Supplier API (SDK 0.9.0).** The Commerce API's Supplier Core has
merged and its contract is frozen; Admin Mobile now reads and writes suppliers through the SDK. The
Phase 2N foundation (UX/domain model, screens, adapter seam) was built first so this integration was a
narrow, mapping-only change rather than a rewrite. There is no fabricated supplier behaviour anywhere —
the server is the sole authority for persistence, uniqueness, lifecycle and permissions.

## SDK

- `@shifted/clothing-commerce-sdk@0.9.0`, vendored at
  `vendor/shifted-clothing-commerce-sdk-0.9.0.tgz`.
- SHA-256 `be787cef21f20a64f86123e0206fd3a880bfe71a6fbd63fb5bb92498c443f850`, pinned and asserted by
  `src/sdk-artifact.test.ts` (runtime `SDK_VERSION`, the `file:` spec, and the tarball hash).

## Supplier capability model (`/me/context`)

`access.suppliers` is **optional** on the context: `{ canRead, canManage }`. It is read defensively by
`supplierCapabilities(context)` (`src/suppliers/capabilities.ts`), defaulting both to `false` when the
block is absent (older server / no access). It drives **UI affordances only**:

- `canRead` → the **Manage suppliers** navigation entry (`app/index.tsx`).
- `canManage` → the **create** affordance (list), and **edit** + **status change** (detail).

The API remains authoritative regardless of what the UI shows: a hidden control is never the security
boundary, and a server **403** is surfaced as an explicit access-denied state, never a silent success.

## The integration seam

`resolveSupplierAdapter(client)` (`src/suppliers/adapter.ts`) returns a concrete, SDK-backed
`SupplierAdapter`. It maps SDK DTOs onto the Admin-owned UI-domain model (`src/suppliers/model.ts`) and
back; screens depend only on the `SupplierAdapter` interface, so they stay transport-agnostic and
directly unit-testable. The adapter hand-writes no HTTP, invents no endpoints, and imports no API
source — the SDK owns transport, the tenant header, and the `Idempotency-Key` header.

Key mappings:

- `referenceCode` ⇄ SDK `code`; SDK `null` optionals ⇄ local `undefined`.
- Structured `SupplierAddress` (a UX input convenience) ⇄ the SDK's single `address` string: flattened
  (non-empty parts joined) on write, and surfaced as `address.line1` on read. The API stores no
  structured address, so nothing structural is invented or displayed.
- `createSupplier` sends no `status` (the API creates suppliers active); an "inactive" choice on create
  is honoured by a follow-up `updateSupplier({ status })` under a derived idempotency key.
- Receiving history: SDK `operationId` → `id`, `supplierReference` → `reference`, `actorMembershipId`
  → `actor`; the receipt-level location is surfaced only when all lines share one location.
- List query (`search` / `status` / `cursor`) round-trips to the server — no client-side filtering.

## Lifecycle

Active/inactive is a **retained, reversible** state, never a deletion. Deactivating keeps the record and
its receiving history and only removes the supplier from the new-receipt selector; reactivating restores
selectability. The server response drives the final state (the detail re-reads after a change).

## Receiving linkage & history

- **Optional** supplier linking in the Inventory **Receive** form
  (`InventoryOperations.tsx` `receiveSuppliers`). Only **active** suppliers are offered (loaded with a
  server `status: "active"` filter in `InventoryScreen.tsx`); an explicit **"No supplier"** choice keeps
  a receipt unlinked. An optional **supplier reference** is sent only alongside a chosen supplier.
- Supplier linking is **best-effort**: if the supplier list is loading or fails, the Receive form falls
  back to a legacy no-supplier receipt — receiving is never blocked.
- **Receiving history** on the supplier detail reads the canonical `listSupplierReceipts` page — it is
  not a second inventory ledger and is never reconstructed client-side. History excluded by
  `inventory.read` location scope is not leaked; a scope denial renders distinctly.

## Idempotency

Create/update/status writes carry an app-supplied idempotency key (`useMutation`); an **ambiguous**
failure (network/5xx) retries with the **same** key (at-most-once). A correctable rejection (duplicate
code, invalid data) does not reuse the key. An `IDEMPOTENCY_CONFLICT` is **never hidden** — it is shown
as terminal, so the operator starts a fresh operation. Changing the supplier or supplier reference on a
receive is a changed intent (new key), never a silently mutated retry.

## Typed error handling

`describeSupplierWriteError` (`src/suppliers/write-errors.ts`) maps distinct server codes to distinct,
actionable messages/recovery: `SUPPLIER_CODE_CONFLICT` (edit), `SUPPLIER_INACTIVE` (terminal),
`SUPPLIER_NOT_FOUND`, `INVALID_SUPPLIER`/`VALIDATION_ERROR` (edit), `IDEMPOTENCY_CONFLICT` (terminal),
plus auth/forbidden (terminal) and network (ambiguous → retry). Nothing collapses into one generic
error.

## Unit-cost deferral & procurement non-goals

No cost fields of any kind are added — **no** supplier cost, cost price, acquisition/landed cost, or
margin/profit calculation. The API deliberately deferred unit-cost/cost-basis accounting because no
coherent cost model exists yet. Also **not** built: Purchase Orders, RFQs, supplier invoices, Accounts
Payable, procurement approvals, supplier portal/payments, and **permanent supplier deletion** (inactive
is a retained state, not a delete).

## Verification

Automated unit/component suite (Vitest) exercises the adapter mappings, pagination, server-side search,
capability-guided navigation, create/edit/lifecycle mappings, receiving-history mapping, the
active-supplier selector and inactive exclusion, optional supplier + reference, legacy receipt, and
typed error mapping — using SDK-shaped DTO fixtures and a test-only fake adapter (no fabricated
production data). Runtime acceptance (Scenarios A–E) lives in `acceptance/suppliers.runtime.tsx`, run
via `pnpm test:runtime` by the out-of-repo orchestration wrapper against a disposable **loopback** API
with a real session (it throws rather than target production).

Gate suite green: `pnpm install --frozen-lockfile`, `expo install --check`, `format:check`, `lint`,
`typecheck`, `test` (342 passing), `build` (web export includes `/suppliers`, `/suppliers/new`,
`/suppliers/[supplierId]`, `/suppliers/edit/[supplierId]`), and `git diff --check`.
