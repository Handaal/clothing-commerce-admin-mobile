# Phase 2O — Staff management

**Status: INTEGRATED against the real Staff API (SDK `0.11.0`, incl. the canonical assignment catalogs).**
Admin Mobile shipped a UI/domain foundation against a narrow `StaffAdapter` seam while the Staff API was
under review; the API core merged (SDK `0.10.0`) and then the read-only assignment catalogs merged (SDK
`0.11.0`). This phase wires the foundation to the real SDK through a single mapping in
`src/staff/adapter.ts`. Every Staff screen still depends only on the adapter interface and the local
UI-domain model — the integration was a mapping change, not a screen rewrite. Nothing fabricates staff
data or a fake success: a failure surfaces as a classified error.

- **Vendored SDK:** `@shifted/clothing-commerce-sdk@0.11.0`, tarball
  `vendor/shifted-clothing-commerce-sdk-0.11.0.tgz`, **SHA-256
  `f549b42544561c8c6b3468292d64a11c3b118f4925e3ad78a2728754a4ad9e80`** (verified in
  `src/sdk-artifact.test.ts`; the `0.10.0` tarball was removed).
- **0.11.0 additions consumed:** `listAssignableStaffRoles()` and `listAssignableStaffScopes()` — the
  canonical, read-only, tenant-scoped, paged catalogs of the `roleId` / `accessScopeId` values
  `assignStaffRole` accepts. They replace the previous derive-from-existing-assignments workaround.

This mirrors how Phase 2N (suppliers) was delivered: foundation first, then a mapping-only integration
once the API froze.

## V1 staff concept

Staff is **operational platform access management, not HR**. It respects the frozen platform invariants
(`current-v1-state.md` §C): `UserIdentity` != `Membership` and `Role` != `Permission` != `Scope`. A
Staff UI record is a **projection** over an existing tenant Membership plus its identity and its
authorization (role + access-scope assignments). There is deliberately **no Employee/payroll model**.

## Local UI-domain model (`src/staff/model.ts`)

Admin-owned types, independent of the SDK DTOs (the mapping lives in `adapter.ts`): `StaffSummary`,
`StaffDetail`, `StaffIdentity`, `EligibleIdentity`, `RoleSummary`/`RoleOption`,
`AccessScopeSummary`/`AccessScopeOption`, `StaffAssignment` (Role + AccessScope **coupled per
assignment**), `MembershipStatus` (`invited` / `active` / `suspended` / `deactivated`, matching the API
enum) and `MembershipStatusTarget` (the `active` / `suspended` / `deactivated` subset a manager may
transition **to** — `invited` is an initial state, never a target), and the `AddStaffInput` /
`RoleScopeAssignmentInput` write inputs.

## Adapter seam (`src/staff/adapter.ts`) — now SDK-backed

One `StaffAdapter` interface is the whole boundary: `listStaff`, `getStaff`,
`findEligibleIdentitiesByEmail`, `createStaffMembership`, `updateMembershipStatus`, `assignRoleScope`,
`unassignRoleScope`, `listAssignableRoles`, `listAssignableScopes`. `resolveStaffAdapter(client)` returns
a concrete adapter that calls the tenant-scoped SDK client and maps its DTOs onto the local model. The
SDK owns the transport, the tenant header and the `Idempotency-Key` header — the app hand-writes no HTTP.
The seam still permits `null` so tests can render the explicit unavailable state, but production always
resolves a concrete adapter.

**DTO → local mapping highlights.** SDK `null` optionals become local `undefined`; a never-empty display
name falls back name → email → `"(no name)"`. An SDK assignment couples `roleId`/`roleName` (+ joined
`permissionKeys` as a hint, `isProtectedRole`) with `accessScopeId`/`scopeName`/`scopeMode`; a `tenant`
scope maps to the tenant-wide kind with no target lines, an `explicit` scope takes the shape of its first
target and surfaces the distinct target **kinds** as readable lines (the SDK gives target `{ kind, id }`
with no human name, so we never fabricate a target name from an id).

**Two contract realities shape the mapping:**

1. **`createStaff` takes only `{ identityId }`** — a new membership is created `active` with no
   assignment. Add-Staff therefore runs the real flow as **two independent operations** so a create
   success is never lost: `createStaffMembership` (`createStaff`, its own idempotency key) then
   `assignRoleScope` (`assignStaffRole`, an **independent** key). The `AddStaffFlow` screen orchestrates
   and recovers between them (see "Create → assign partial-state recovery"). A membership with zero
   assignments is security-safe (zero effective permissions), so an isolated create is never a leak.
2. **The role/scope options come from the canonical server catalogs** (SDK `0.11.0`):
   `listAssignableRoles` reads `listAssignableStaffRoles` and `listAssignableScopes` reads
   `listAssignableStaffScopes`, each following server cursor pagination to completion (bounded,
   fail-closed via the shared `collectAllPages`). These are the single source of the role ids /
   access-scope ids `assignStaffRole` accepts. Options are **never** derived from other members'
   assignments — that derivation is empty on a fresh tenant and silently drops valid-but-unused
   roles/scopes. The role catalog carries `permissionKeys` (surfaced as a human hint) and is
   server-filtered to roles whose permissions the caller already holds; the scope catalog carries each
   explicit scope's **named** targets (`kind` + canonical `name`, e.g. "Branch: Downtown"). The catalogs
   are **selection surfaces only** — the write re-runs every authorization check, so a visible option is
   never assumed assignable.

### Create → assign partial-state recovery (`AddStaffFlow.tsx`)

Because create and assign are two commands, `AddStaffFlow` handles a partial success explicitly. On
"Add staff member" it runs `createStaffMembership`; on that success it **remembers the created
membership** and automatically runs the initial `assignRoleScope`. If the assignment fails, the screen
shows a **"Finish access setup"** state that reports the member was created but access is not yet assigned
(never "nothing happened", never a fake success). From there the manager can **retry only the
assignment** — an ambiguous failure reuses the same assignment key (at-most-once), and the create is
**never** re-run — or **open the staff record** to complete/adjust access there. Only the authoritative
post-assignment `StaffDetail` drives the final success. The two idempotency domains are independent:
changing the role/scope is a new assignment intent (a new key), while the create key is retired the
moment the membership exists.

## Capability seam (`src/staff/capabilities.ts`)

`GET /me/context` now exposes a typed `access.staff` block (`{ canRead, canManage }`, optional). The
`staffCapabilities` helper reads it directly (deny-by-default when absent). `canRead` gates the **Manage
staff** navigation entry; `canManage` gates Add-Staff and every mutation control. The API remains the
sole authority — a hidden control is never the security boundary, and a real `403` surfaces distinctly.

## Screens & components

- **Staff list** (`StaffListScreen.tsx`): loading / error / empty / populated, server-side search +
  status filter (All / Invited / Active / Suspended / Deactivated) + optional role filter when role
  options are supplied, bounded fail-closed cursor pagination. Rows show display name, email, status, and
  role summary. (SDK list summaries carry roles but no scopes, so a row shows role labels and no scope
  summary.) Query state is explicit (`search.ts`); no client-side filtering.
- **Staff detail** (`StaffDetailScreen.tsx`): identity, membership status, and assignments rendered as
  **Role + AccessScope pairs** (`StaffAssignmentList.tsx`). A **deactivated** membership stays fully
  readable and offers **no delete**. Lifecycle actions (`MembershipStatusActions.tsx`) and an
  add-assignment panel appear only for a manager; every mutation re-reads the authoritative record.
- **Add-Staff flow** (`AddStaffFlow.tsx`): find **existing** account(s) by **exact email** and explicitly
  select one (`EligibleIdentityLookup.tsx`), choose an existing role (`RoleSelector.tsx`), choose an
  existing access scope (`AccessScopeSelector.tsx`), review, then create. **Add-Staff links an existing
  provisioned identity** — no Clerk invite, no email send, no password, no raw-UUID entry.

  ### Exact-email eligible-account lookup (frozen V1 privacy decision)

  Discovery is an **exact, existing-account email lookup** (`findEligibleStaffIdentitiesByEmail(email) ->
{ items: EligibleIdentity[] }`), not a directory search. Because a platform `primary_email` is **not
  globally unique**, the lookup returns **0, 1, or N** accounts:

  - **0 matches** — one neutral message: **"No eligible account was found for this email."** It covers
    every not-eligible case (no such account / inactive identity / already a staff member) — the screen
    never distinguishes them, so it cannot probe who exists on the platform.
  - **1 match** — the single account is shown; the operator **explicitly selects** it, then proceeds.
  - **2+ matches** — **all** accounts sharing that exact email are shown (display name, exact email,
    identity status only). **None is auto-selected;** the manager must **explicitly choose** which
    identity to link. The role step stays unavailable until one is selected.

  The email is validated (trimmed/lowercased) **before** the adapter is called; an invalid email never
  reaches it. There is **no directory browse, no display-name search, no wildcard, and no raw-UUID
  workflow**, and **no Clerk invitation / email send**.

- Routes: `app/staff/index.tsx`, `app/staff/[membershipId].tsx`, `app/staff/new.tsx` (each resolves the
  adapter from `getTenantClient(tenantId)`); navigation entry in `app/index.tsx`.

## Membership lifecycle

`invited` (initial state, rarely surfaced — `create_staff` links an identity directly as `active`),
`active` (normal access), `suspended` (reversible temporary disable), `deactivated` (revoked/terminal;
retained + readable, **never a physical delete**). Lifecycle controls only ever target
`active`/`suspended`/`deactivated`. Destructive transitions require a confirmation; from `deactivated`
the UI offers no lifecycle action (the server owns any reactivation rule — `deactivated → active` is
refused with `STAFF_CONFLICT`). The server also enforces **last-admin** protection: suspending,
deactivating, or de-privileging the final tenant-wide `staff.manage` admin is rejected with
`LAST_STAFF_ADMIN`.

## Read-only mode

With `staff.read = true`, `staff.manage = false`: list + detail remain available; Add-Staff, role/scope
mutation, and lifecycle controls are all withheld. The API re-authorizes regardless.

## Error mapping (`src/staff/write-errors.ts`)

Maps the **real, frozen** Staff API codes onto distinct local categories, each with its own heading,
message and recovery — nothing collapses into one generic error:

| API code (SDK 0.11.0)        | Category            | Recovery |
| ---------------------------- | ------------------- | -------- |
| `STAFF_PRIVILEGE_ESCALATION` | `cannot-delegate`   | none     |
| `LAST_STAFF_ADMIN`           | `last-admin`        | none     |
| `STAFF_CONFLICT`             | `staff-conflict`    | none     |
| `IDENTITY_INACTIVE`          | `identity-inactive` | edit     |
| `INVALID_STAFF`              | `invalid`           | edit     |
| `IDEMPOTENCY_CONFLICT`       | `conflict`          | none     |
| `STAFF_NOT_FOUND`            | `not-found`         | none     |

`STAFF_PRIVILEGE_ESCALATION` is the single anti-escalation code (it covers both an unheld-permission role
and a foreign scope); `STAFF_CONFLICT` covers "already a member", a duplicate active assignment, a
revoked membership, and a refused transition. A known business code is matched **before** the transport
fallback (`network`/`server`/`contract` → `ambiguous` retry; `forbidden` → `denied`; `auth` → `session`).
`IDEMPOTENCY_CONFLICT` is never hidden. Idempotency/retry reuse the shared `useMutation` discipline (same
key on ambiguous retry → at-most-once); changing identity/role/scope/lifecycle intent is a changed intent
and the server returns `IDEMPOTENCY_CONFLICT` if a key is reused with a different payload.

## Implemented in 2O vs remaining

**Implemented (integrated):** the real SDK-backed adapter and DTO mapping; typed `access.staff`
capabilities; server-side list (search / status / role filter, pagination); detail (identity + status +
role/scope-coupled assignments + timestamps); exact-email 0/1/N eligible lookup; **canonical assignable
role/scope catalogs** (paged, independent of existing assignments); Add-Staff (create → assign as two
independent operations) with **explicit create→assign partial-state recovery**; role/scope assign +
unassign (re-read on success); membership lifecycle incl. `invited`; read-only mode; anti-escalation /
last-admin / conflict / idempotency error surfaces mapped to the real codes.

**Resolved in this closeout (was "remaining"):**

- **The derive-from-existing-assignments workaround is removed.** Assignable options now come from the
  canonical `listAssignableStaffRoles` / `listAssignableStaffScopes` catalogs, so a valid role/scope that
  no existing member holds — including on a fresh tenant — still appears (regression-tested in
  `src/staff/adapter.test.ts` and runtime scenario N).
- **Add-Staff partial success is handled.** A create that succeeds followed by an assign that fails is
  surfaced honestly and recovered by retrying only the assignment (never re-creating), so at most one
  membership ever results (runtime scenario M).

**Remaining after 2O (product decisions, not blockers):** role/scope/target **authoring** stays deferred
(V1 assigns existing roles/scopes by id); and there is no single-call "create with initial assignment"
endpoint, so Add-Staff remains two commands — handled by the recovery UX above.

**Non-goals:** HR / payroll; role creation/editing; permission editing; access-scope or branch/location
creation; and any Clerk invitation / email / password flow.

## Verification

Automated unit/component suite (Vitest): the SDK artifact/version/SHA (`0.11.0`); the **SDK-backed
adapter mapping** (list query pass-through + summary mapping; detail with role/scope coupling and target
kinds; tenant vs explicit scope; exact-email 0..N lookup incl. null-name fallback; `createStaffMembership`
create-only step; lifecycle/assign/unassign inputs; **canonical role/scope catalog mapping** incl.
permission-key summary, named scope targets, server pagination, and the fresh-tenant regression that an
unused role/scope still appears because it comes from the catalog, not derivation); typed capabilities
incl. deny-by-default; the write-error categorisation against the real codes; list
loading/error/empty/populated + pagination + server search; read-only vs manage; detail rendering +
assignment coupling + lifecycle confirmation + deactivated readability + unassign; and the full Add-Staff
flow (exact-email lookup → explicit select → role → scope → review → create → assign) with a blocked
invalid email, a neutral 0-result, a 1-result explicit confirm, a 2+ set that shows every match and
auto-selects none, the **create→assign partial-success recovery** (retry only the assignment, never
re-create), no fake success, no directory/display-name search, and no raw-UUID entry.

Gate suite green: `pnpm install --frozen-lockfile`, `expo install --check`, `format:check`, `lint`,
`typecheck`, `test`, `build` (web export includes `/staff`, `/staff/new`, `/staff/[membershipId]`), and
`git diff --check`.

**Runtime acceptance (A–M):** see `docs/phase-2o-validation.md` for the disposable-API acceptance
harness (`acceptance/staff.runtime.tsx`), its orchestration wrapper, and results.
