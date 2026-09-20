# Phase 2M Admin Mobile returns & refunds visibility

Starting SHA: `a99da1ffdbda5ed515c7dd935c621085d5339c6a` (`phase/2l-admin-online-orders` HEAD, the
online-order-visibility work). Phase 2L is not yet merged to `main`, and the Phase 2M regression set
explicitly requires ONLINE orders to be preserved, so this branch is cut from the latest integrated
work rather than from `main` (which would drop online orders). Branch: `phase/2m-admin-returns`.

## SDK and compatibility

Upgraded the committed relative tarball dependency from 0.7.0 to **0.8.0**. Verified the supplied
artifact before consuming it, against the SHA published by the API repo's Phase 2M validation:

`3bc355f638426993a7d7bd69c818855b1776540630d9701f03c770aa3fae3056`

The runtime version, relative `file:` dependency path and SHA-256 remain asserted by
`src/sdk-artifact.test.ts`. The obsolete 0.7.0 tarball is removed. No SDK source or API source is
imported into this application; it consumes only the packed tarball under `vendor/`.

## Scope and contract limits

This is management **visibility** only. SDK 0.8.0 exposes `createReturn` and `settleRefund`, but this
app wires **neither** — it adds no cashier/return terminal, no remote physical-return initiation and
no manual refund action. Only the read operations are used: `listReturns` (per order), `getReturn`,
and the optional `returns` summary embedded in `getOrder`.

- **Order Detail** shows per-line **returned** quantity and a **Returns & refunds** summary (exact
  `pendingRefundMinor` vs `refundedMinor`) from the order projection. This is present only when the
  caller also holds return-read scope, and an all-zero summary is treated as "nothing returned"
  rather than fabricated activity.
- **Return history** is integrated into Order Detail. SDK 0.8.0 has **no global returns list**, so
  history is scoped to its original order via `listReturns` and its cursor is followed across every
  page with the shared bounded, fail-closed pagination primitive — never a client-side store. Each
  row shows the return reference, source channel (POS / ONLINE), date/time, returned value, exact
  refund state and a disposition summary, and opens the full return.
- **Return Detail** (`getReturn`) renders the server's own fields only: original order, lines,
  quantities, reason, disposition, refund amount, refund state, actor membership, client source and
  timestamps. Source is labelled as audit metadata, explicitly not an authorization credential.
- **Refund state** is rendered exactly as reported — `pending`, `succeeded`, `failed`. Pending is
  never shown as settled; `failed` notes the amount stays reserved. Wording comes from the API's
  documented semantics.
- **Inventory disposition** is shown as its operational effect: `restock` re-enters sellable
  inventory (surfacing the canonical receiving location and inventory operation id when the server
  provides them); `non_restock` is damaged / write-off that does not re-enter stock. No warehouse
  subledger internals are exposed.
- **Authorization** is server-authoritative. The return-history section classifies a return-scope
  denial (403) distinctly from not-found and from network/transient failures, and it loads
  independently so a denial there does not break the rest of the order body. Return Detail maps 404 /
  403 / network as distinct states, matching the existing order surfaces.
- Channel is a single return domain: POS and ONLINE returns are the same screens with a channel
  badge, not separate return domains.

## Real runtime acceptance

Executed on **2026-09-20**, against the API repo's Phase 2M branch
(`phase/2m-returns-refunds-core`, commit `d4ddaf1`) using its **own** disposable Supabase/PostgreSQL
and real Next.js HTTP runner. No API repository source was edited. An out-of-repo orchestration
wrapper (committed to neither repository) reused the API's guarded disposable-resource helper to:

1. Start an isolated Supabase project and Next.js server, applying the real migrations and the
   `phase_2h_pos_sale` / `phase_2l_online` / `phase_2m_returns` fixtures.
2. Sign the fixture's `pos-full` session, verified by the real Clerk backend verifier.
3. As fixture setup (via the SDK, **not** the application): received sellable stock, made a real POS
   sale of 2 units, and created a real POS **return** of 1 unit with `restock` disposition and a
   `manual_confirmed` cash refund.
4. Run this repository's `pnpm test:runtime` returns suite (`acceptance/returns.runtime.tsx`) against
   the live loopback API, then tear the whole environment down.

The committed mobile acceptance suite is **read-only** — it performs no returns/POS mutation; it only
inspects the fixture the wrapper created, through the real React Native Web screens under jsdom with
the real vendored SDK and real HTTP.

Observed:

- POS return eligibility over real HTTP: `eligible=true`, `maxRefundableMinor=5000`.
- Created POS return refund state `succeeded`, disposition `restock`.
- **Order Detail** reflected the returned quantity and the Returns & refunds summary, and its return
  history row rendered the exact `Refund succeeded` state.
- **Return Detail** rendered `accepted`, the `POS` channel, the original order id, the exact refund
  state, the restock stock-receipt wording, and navigated back to the original order.

**Result: 2 mobile runtime tests passed, 1 skipped.** The skipped test is the ONLINE return: the
online fixture's orders are pending COD (payment not captured), so the API correctly reports them
ineligible for a refund (`PAYMENT_NOT_CAPTURED`) and no ONLINE return can be created from the current
fixture. This is a real fixture limitation, reported rather than fabricated; the ONLINE path is
otherwise identical (same screens, channel badge) and is covered by the unit suite.

An interactive Clerk-authenticated device walkthrough was not performed: this environment cannot mint
a live Clerk session JWT or drive interactive mobile login (the same constraint documented for prior
phases). Business responses, SDK calls and API authorization in the automated acceptance are real.

## Validation gates

Final results: frozen install, Expo dependency check, formatting/check, ESLint, strict TypeScript,
**255 tests / 33 files**, production Expo web export (**10 routes**, including `/returns/[returnId]`)
and `git diff --check` all passed. The suite covers auth/bootstrap, catalog management, inventory
receive/adjust/transfer, POS orders, ONLINE order visibility, existing fulfillment, and the new
returns modules (refund/disposition labels, order return summary, bounded return history loader,
`ReturnHistory`, `ReturnDetailScreen`, and Order Detail returns integration). The separate real
runtime results are the **2 mobile tests** above.

Commands:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd exec expo install --check
pnpm.cmd format
pnpm.cmd format:check
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
# Real runtime acceptance is driven by the out-of-repo wrapper, which provisions the API's disposable
# environment, creates the POS return fixture, then runs:
pnpm.cmd exec vitest run --config vitest.runtime.config.mts acceptance/returns.runtime.tsx
git diff --check
```

## Merge dependency

The API Phase 2M returns/refunds core must merge and SDK 0.8.0 must be final before this mobile PR is
merged. Do not merge automatically.
