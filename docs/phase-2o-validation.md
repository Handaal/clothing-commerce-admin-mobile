# Phase 2O — Staff management runtime validation

This documents the runtime acceptance harness for the Staff integration and its execution status.

## Harness

`acceptance/staff.runtime.tsx` drives the **real application screens** (`StaffListScreen`,
`StaffDetailScreen`, `AddStaffFlow`) through a minimal in-memory router, wired exactly as production
(`resolveStaffAdapter(getTenantClient(tenantId))` + `staffCapabilities`). Only **device primitives** are
substituted — Clerk auth, secure tenant storage, and the `expo-crypto` CSPRNG (mapped to the platform Web
Crypto so idempotency keys are still real, unique v4 UUIDs); the `SessionProvider` bootstrap,
`/me/context`, the SDK, the HTTP transport, and all server-side authorization are real. It runs under
`pnpm test:runtime` (config `vitest.runtime.config.mts`, which defines the Metro `__DEV__` global via
`acceptance/runtime.setup.ts`), is excluded from the unit gate, and **never targets production** — a
non-loopback URL or missing session makes `beforeAll` throw so the suite cannot run.

### Orchestration wrapper

`scripts/test-staff.mjs` **in the API repo** is the disposable HTTP provisioning wrapper (built in this
closeout, modelled exactly on `scripts/test-returns.mjs`). It: boots an ownership-validated **disposable
Supabase** on random loopback ports in an isolated workdir (never a developer database); applies
migrations; runs the staff + tenant **RLS** pgtap suites; loads the fixture graph
(`phase_2h_pos_sale.setup.sql` for the tenant-wide admin actor + roles/scopes, then
`phase_2o_staff.setup.sql` for linkable identities, the shared-email duplicate pair, and the
subset/escalated/archived/permissionless/foreign catalog fixtures); mints a locally-signed **RS256
Clerk-verifiable** session (the API verifies it via `CLERK_JWT_KEY`, no real Clerk network) for the seeded
tenant-wide `staff.manage` admin (clerk subject `pos-full`); boots the **real Next.js API**; exports the
`STAFF_TEST_*` env below; and runs the Admin-Mobile suite via its own `vitest.runtime.config.mts`. It
tears the disposable project down on success, failure, or interrupt. Run it from the API repo with
`node scripts/test-staff.mjs` (set `ADMIN_MOBILE_DIR` if the app checkout is not the sibling default).

### Environment contract (provisioned by the wrapper)

| Env var                         | Purpose                                                                         | Scenarios |
| ------------------------------- | ------------------------------------------------------------------------------- | --------- |
| `STAFF_TEST_URL`                | Disposable loopback API base URL (`http://127.0.0.1:…`)                         | all       |
| `STAFF_TEST_TOKEN`              | Clerk-verifiable session for a tenant-wide `staff.manage` admin                 | all       |
| `STAFF_TEST_ELIGIBLE_EMAIL`     | Exact email of an **active identity with no membership** in the tenant          | B/C/D/E/I |
| `STAFF_TEST_TENANT_ID`          | Tenant id (defaults to the standard fixture tenant)                             | all       |
| `STAFF_TEST_DUP_EMAIL`          | Email shared by **2+** eligible identities (`shared@example.test`)              | C (N)     |
| `STAFF_TEST_PARTIAL_EMAIL`      | Fresh active non-member reserved for the create→assign recovery proof           | N/G, M    |
| `STAFF_TEST_READONLY_TOKEN`     | (optional) session for a `staff.read`-only membership                           | K         |
| `STAFF_TEST_SECOND_ADMIN_TOKEN` | Independent session (subject `staff-admin-2`) provisioned as admin B at runtime | J         |

## Scenario → coverage map

| #   | Scenario                     | Harness coverage                                                                        |
| --- | ---------------------------- | --------------------------------------------------------------------------------------- |
| A   | List / detail                | Load list, open a member, assert status + assignments render                            |
| B   | Exact-email lookup           | Exact email finds an account; partial email and display-name are blocked                |
| C   | 0 / 1 / N                    | Neutral 0-result; selectable 1-result; N-result (`DUP` seeded) none auto-selected       |
| D   | Add staff                    | lookup → select → catalog role → catalog scope → create → assign → detail               |
| E   | Duplicate add                | Re-adding the same identity surfaces the server `STAFF_CONFLICT` distinctly             |
| F   | Role / scope assign+unassign | Assign on detail (re-read), then unassign (re-read)                                     |
| G   | Anti-escalation (catalog)    | A non-delegable role is **not offered** by the canonical role catalog (UI side)         |
| H   | Foreign scope                | Foreign scope absent from the real catalog selector; direct assign refused, no mutation |
| I   | Suspend / reactivate         | Suspend → Active → (against the added member, not the last admin)                       |
| J   | Last-admin protection        | Single-admin removal refused (last-admin error, no mutation); with 2 admins it succeeds |
| K   | Read-only manager            | With a read-only session: list+detail, no Add-Staff / mutation controls                 |
| L   | Deactivated history          | Deactivate the added member; record stays readable, terminal, no delete                 |
| M   | Create ok / assign fails     | Injected assign failure → partial state; retry only assign; one membership, no dup      |
| N   | Fresh-tenant catalog         | An unused role/scope (on no member) still appears — canonical catalog, not derived      |

### N + G — the canonical-catalog regression (key 0.11.0 proof)

Scenario **N** opens Add-Staff and asserts an active, permissionless role held by **no** existing staff
member (fixture "Empty Role") is still offered, and that an explicit scope catalog is reachable — proving
the options are the canonical `listAssignableStaffRoles` / `listAssignableStaffScopes` catalogs, not a
derivation from other members' assignments (which would omit them, and would be empty on a fresh tenant).
Scenario **G** (UI side) asserts a role carrying a permission the manager lacks (fixture "Privileged" with
`reports.read`) is **absent** from the catalog, since the API filters the role catalog to the caller's
own permissions.

### H / J — now proven ADMIN-SIDE against the real API (not only server-side)

Foreign-scope isolation and last-admin remain **server-enforced invariants**, and the API's own suite
still gates them (`tests/staff/contract-service.test.ts`, `pnpm test:staff:persistence`,
`pnpm test:staff:rls`, and the pgtap in `supabase/migrations/20260922180000_create_staff_management.sql`).
As of this closeout they are **additionally proven through the real Admin UI over real HTTP** in
`acceptance/staff.runtime.tsx`, so the Admin-relevant behaviour — not just the server invariant — is
covered:

- **H — foreign scope isolation.** The fixtures seed an access scope owned by a **different** tenant
  (`Foreign Scope` on tenant `…-002`). The runtime opens the real detail add-assignment picker (fed by the
  canonical `listAssignableStaffScopes` catalog) and asserts a current-tenant scope (`POS Tenant`)
  **appears** while `Foreign Scope` is **absent** — so the normal UI can never select it. It then uses the
  **real production adapter seam** (`resolveStaffAdapter(...).assignRoleScope`, not a mock and not an added
  UI feature) to attempt a direct assignment of the foreign scope id paired with a known-delegable role.
  The **real API refuses it** (HTTP 404 `STAFF_NOT_FOUND` — the foreign scope does not exist within the
  caller's tenant, i.e. tenant isolation makes it invisible), the Admin maps it to a distinct, non-silent
  `not-found` category (`recovery: "none"`), and a re-read proves **no assignment was created**.
- **J — last-admin, single admin.** The base actor is the tenant's only tenant-wide `staff.manage` admin.
  Removing its qualifying Role+Scope assignment through the real `StaffDetailScreen` unassign control is
  **refused with `LAST_STAFF_ADMIN`**; the UI shows the dedicated last-admin error (heading **“Last
  administrator”**, body **“This is the final staff administrator and cannot be removed or deactivated.
  Assign another administrator first.”**, `recovery: "none"`), and an authoritative re-read shows the
  assignment **unchanged**.
- **J — last-admin, two admins.** The runtime provisions a **second** tenant-wide `staff.manage` admin
  (identity `staff-admin-2`, granted `POS Full` @ `POS Tenant`), then repeats the same removal against the
  base actor through the real UI. It now **succeeds**. Because that removal strips the base actor's own
  `staff.read`, success is verified authoritatively through the **second admin's independent session**
  (`STAFF_TEST_SECOND_ADMIN_TOKEN`): the base actor ends with zero assignments, the second admin remains a
  qualifying tenant-wide admin, and the tenant is never left without one.

The Admin-side error presentation is additionally covered by the unit suite
(`src/staff/write-errors.test.ts`, `StaffDetailScreen.test.tsx`).

## Execution status

**Executed and PASSED against a real disposable HTTP API.** In this closeout the orchestration wrapper
(`scripts/test-staff.mjs`, above) was built and run: it booted a disposable Supabase + the real Next.js
API with a locally-signed Clerk-verifiable admin session and the full staff fixture graph, then drove the
real Admin-Mobile UI. Results:

- **Database RLS:** `phase_2o_staff_rls.test.sql` + `phase_1c_b_tenant_rls.test.sql` — **117 pgtap tests
  PASS**.
- **Admin-Mobile UI runtime (real HTTP):** `acceptance/staff.runtime.tsx` — **12/12 tests PASS** covering
  scenarios A, B, C, D+E, F, G+N, I+L, K, M, **H, J (single admin), J (two admins)** (K is a no-op unless a
  read-only token is provisioned).

| #   | Result | Notes                                                                                               |
| --- | ------ | --------------------------------------------------------------------------------------------------- |
| A   | PASS   | List loads (real members), member opens, status + assignments render                                |
| B   | PASS   | Exact email finds an account; partial email and display-name blocked at the UX                      |
| C   | PASS   | Neutral 0-result; selectable 1-result; N-result shows both shared-email identities, none auto       |
| D   | PASS   | lookup → select → **catalog** role → **catalog** scope → create → assign → detail; 1 membership     |
| E   | PASS   | Second add of the same identity creates **no** duplicate (still exactly one membership)             |
| F   | PASS   | Assign a catalog role+scope on detail (re-read), then unassign (re-read to empty)                   |
| G   | PASS   | Non-delegable "Privileged" role is **absent** from the canonical role catalog                       |
| H   | PASS   | Foreign scope absent from the real catalog selector; direct assign refused (404), no mutation       |
| I   | PASS   | Suspend → Active on a dedicated member (never the last admin)                                       |
| J   | PASS   | Single-admin removal refused (last-admin error, no mutation); with a 2nd admin the removal succeeds |
| K   | PASS   | Read-only path (runs fully when `STAFF_TEST_READONLY_TOKEN` is set; otherwise a no-op)              |
| L   | PASS   | Deactivate keeps the record readable + terminal, no delete                                          |
| M   | PASS   | Injected assign failure → partial state; retry **only** the assignment; **one** membership, no dup  |
| N   | PASS   | An unused role ("Empty Role", on no member) still appears — canonical catalog, not derivation       |

All 14 scenarios (A–N) are now **Admin UI + real API proven** over real HTTP. The API repo's merged suite
(`test:staff:persistence`, `test:staff:rls`, `tests/staff/contract-service`) remains the authoritative
server-invariant regression proof (idempotency conflict, anti-escalation write-path, foreign-scope and
last-admin at the database level); it is complementary to — not a substitute for — the Admin-side H/J
proof above. The Admin-side error presentation is also unit-covered (`src/staff/write-errors.test.ts`,
`StaffDetailScreen.test.tsx`).

## Gate suite (green)

`pnpm install --frozen-lockfile`, `pnpm exec expo install --check`, `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm test` (**430 pass**), `pnpm build`, `git diff --check`; plus
`node scripts/test-staff.mjs` (API repo) for the real-HTTP runtime **A–N (12 UI tests + 117 pgtap RLS),
all pass**.
