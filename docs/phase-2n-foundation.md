# Phase 2N — Supplier management foundation

**Status: UX/domain foundation only. There is no Supplier API/SDK yet.** The Commerce API's Supplier
Core is implemented separately (later). This phase prepares Admin Mobile so that final SDK integration
is a narrow change once the contract exists, without shipping any fake supplier behaviour in the
meantime.

## What this phase includes

- A **Manage suppliers** navigation entry (shown unconditionally — no supplier access flag exists in
  `/me/context` yet, and none is invented).
- Admin-owned **domain model** and validation (`src/suppliers/model.ts`): `SupplierDraft`, `Supplier`,
  `SupplierSummary`, `SupplierReceipt`; required name, optional email/phone format checks, field-length
  caps, and `normalizeSupplierDraft` (trim + drop empty optionals).
- **List + server-side search** UX with loading/empty/error/populated states and active/inactive
  presentation (`SuppliersListScreen.tsx`, `search.ts`).
- **Detail** with a clearly separated **receiving-history** section and an active/inactive toggle that
  is confirmed and reversible — never a delete (`SupplierDetailScreen.tsx`,
  `SupplierReceivingHistory.tsx`).
- One reusable **create/edit form** submitting through the adapter seam with an idempotency key
  (`SupplierForm.tsx`, `SupplierFormScreen.tsx`).
- An **optional Supplier slot** in the Inventory Receive form (`receiveSupplierSlot`) — structural
  only, adds no field to the receive request.

## The single integration seam

`resolveSupplierAdapter(client)` (`src/suppliers/adapter.ts`) returns `null` today. Screens depend on
the `SupplierAdapter` interface, so with no adapter they render an explicit **"not available yet"**
state — never fabricated rows, mutations, or history.

## Unresolved SDK/API dependencies (waiting on Supplier Core)

1. `SupplierAdapter` implementation inside `resolveSupplierAdapter` (map SDK DTOs → local model).
2. Real `SupplierListQuery` params (search fields + status) and the `listSupplierReceipts` page shape.
3. Whether `/me/context` gains a supplier access flag (then gate nav + create on it).
4. Whether the receipt contract defines a supplier field (then wire `receiveSupplierSlot` +
   `supplierId`).

## Explicit non-goals (not built, even in the foundation)

Purchase Orders, RFQs, supplier invoices, Accounts Payable, procurement approvals, supplier portal,
supplier payments, and **permanent supplier deletion**. Inactive is a retained, historically-visible
state, not a delete.

## Verification (this phase)

Proven by the unit/component suite against the local model and a **test-only** fake adapter
(`fakeSupplierAdapter` in `src/test-support/fixtures.ts`); production still resolves to `null`. No live
Supplier API exists to exercise, and there is deliberately no fabricated success path. Full gate suite
green: `expo install --check`, `format:check`, `lint`, `typecheck`, `test` (312 passing), `build`
(web export includes `/suppliers`, `/suppliers/new`, `/suppliers/[supplierId]`,
`/suppliers/edit/[supplierId]`), and `git diff --check`.
