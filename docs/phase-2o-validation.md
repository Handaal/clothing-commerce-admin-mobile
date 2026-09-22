# Phase 2O — Staff management runtime validation

This documents the runtime acceptance harness for the Staff integration and its execution status.

## Harness

`acceptance/staff.runtime.tsx` drives the **real application screens** (`StaffListScreen`,
`StaffDetailScreen`, `AddStaffFlow`) through a minimal in-memory router, wired exactly as production
(`resolveStaffAdapter(getTenantClient(tenantId))` + `staffCapabilities`). Only the device auth/storage
adapters are mocked; the `SessionProvider` bootstrap, `/me/context`, the SDK, the HTTP transport, and all
server-side authorization are real. It runs under `pnpm test:runtime` (config
`vitest.runtime.config.mts`), is excluded from the unit gate, and **never targets production** — a
non-loopback URL or missing session makes `beforeAll` throw so the suite cannot run.

### Environment contract (out-of-repo provisioning)

| Env var                     | Purpose                                                                | Scenarios |
| --------------------------- | ---------------------------------------------------------------------- | --------- |
| `STAFF_TEST_URL`            | Disposable loopback API base URL (`http://127.0.0.1:…`)                | all       |
| `STAFF_TEST_TOKEN`          | Clerk-verifiable session for a tenant-wide `staff.manage` admin        | all       |
| `STAFF_TEST_ELIGIBLE_EMAIL` | Exact email of an **active identity with no membership** in the tenant | B/C/D/E/I |
| `STAFF_TEST_TENANT_ID`      | Tenant id (defaults to the standard fixture tenant)                    | all       |
| `STAFF_TEST_DUP_EMAIL`      | (optional) email shared by **2+** eligible identities                  | C (N)     |
| `STAFF_TEST_READONLY_TOKEN` | (optional) session for a `staff.read`-only membership                  | K         |

## Scenario → coverage map

| #   | Scenario                     | Harness coverage                                                                 |
| --- | ---------------------------- | -------------------------------------------------------------------------------- |
| A   | List / detail                | Load list, open a member, assert status + assignments render                     |
| B   | Exact-email lookup           | Exact email finds an account; partial email and display-name are blocked         |
| C   | 0 / 1 / N                    | Neutral 0-result; selectable 1-result; N-result (if `DUP` seeded) none auto-sel. |
| D   | Add staff                    | lookup → select → role → scope → create → detail; membership visible             |
| E   | Duplicate add                | Re-adding the same identity surfaces the server `STAFF_CONFLICT` distinctly      |
| F   | Role / scope assign+unassign | Assign on detail (re-read), then unassign (re-read)                              |
| I   | Suspend / reactivate         | Suspend → Active → (against the added member, not the last admin)                |
| L   | Deactivated history          | Deactivate the added member; record stays readable, terminal, no delete          |
| K   | Read-only manager            | With a read-only session: list+detail, no Add-Staff / mutation controls          |
| G   | Anti-escalation              | **Server-enforced** — see below                                                  |
| H   | Foreign scope                | **Server-enforced** — see below                                                  |
| J   | Last-admin protection        | **Server-enforced** — see below                                                  |

### G / H / J — server-enforced, proven by the API's own suite

Anti-escalation (`STAFF_PRIVILEGE_ESCALATION`), foreign-scope (same code), and last-admin
(`LAST_STAFF_ADMIN`) are enforced entirely server-side and require fixtures the Admin UI deliberately
**cannot create** — a role carrying a permission the caller does not hold, a scope outside the caller's
authority, and a second `staff.manage` admin. These are proven in the API repo by
`tests/staff/contract-service.test.ts`, the staff persistence/RLS suites (`pnpm test:staff:persistence`,
`pnpm test:staff:rls`), and the pgtap in `supabase/migrations/20260922180000_create_staff_management.sql`
— the same suite that gated the API merge. On the Admin side, the UI surfaces these refusals distinctly
(`cannot-delegate` / `last-admin` categories, `recovery: "none"`, never a silent success), which is
covered by the unit suite (`src/staff/write-errors.test.ts`, `StaffDetailScreen.test.tsx`).

## Execution status

**Not executed in the current environment.** Running A–L requires provisioning a disposable Staff **HTTP**
API on loopback plus a Clerk-verifiable admin token and the scenario fixtures above (an existing staff
member, an eligible non-member identity, and optionally a duplicate-email pair / read-only membership).
Unlike Phase 2N (which reused `scripts/returns-test-resources.mjs` for its loopback provisioning), the API
repo currently exposes only **DB-level** staff test entry points (`test:staff:persistence`,
`test:staff:rls`) — there is no staff HTTP-runtime provisioning wrapper or seeded eligible-identity
fixture. Standing that up is out of scope for this client-side integration and is **not faked here**.

What IS proven now:

- The full Admin-side behaviour for every scenario is covered by the unit/component suite (427 tests),
  including the SDK-backed adapter DTO mapping, the exact-email 0/1/N flow, create→assign orchestration,
  lifecycle, and the real error-code categorisation.
- The server-side invariants (G/H/J, idempotency conflict) are proven by the API repo's merged suite.
- The harness itself compiles, lints, and is wired exactly as production, so it runs as-is once a
  disposable Staff API + fixtures are provisioned (set the env vars above and run `pnpm test:runtime`).

## Gate suite (green)

`pnpm install --frozen-lockfile`, `pnpm exec expo install --check`, `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test` (427), `pnpm build`, `git diff --check`.
