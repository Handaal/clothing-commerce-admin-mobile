# Phase 2O — Staff management

**Status: INTEGRATED against the real Staff API (SDK `0.10.0`).** Admin Mobile shipped a UI/domain
foundation against a narrow `StaffAdapter` seam while the Staff API was under review; the API core has
since merged, and this phase wires the foundation to the real SDK through a single mapping in
`src/staff/adapter.ts`. Every Staff screen still depends only on the adapter interface and the local
UI-domain model — the integration was a mapping change, not a screen rewrite. Nothing fabricates staff
data or a fake success: a failure surfaces as a classified error.

- **Vendored SDK:** `@shifted/clothing-commerce-sdk@0.10.0`, tarball
  `vendor/shifted-clothing-commerce-sdk-0.10.0.tgz`, **SHA-256
  `74247c03b44ad81f07bf777e78bb7cdf5734c75a482744702ed26a157189cb99`** (verified in
  `src/sdk-artifact.test.ts`; the `0.9.0` tarball was removed).

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
`findEligibleIdentitiesByEmail`, `addStaff`, `updateMembershipStatus`, `assignRoleScope`,
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
   assignment. So `addStaff` orchestrates the real two-step flow: `createStaff` → `assignStaffRole`,
   under one operator idempotency key (the assign step derives a stable `${key}-assign` sub-key). An
   ambiguous retry replays both steps at-most-once. The authoritative post-assignment `StaffDetail` is
   returned.
2. **There is no role/scope catalog endpoint** (V1 assigns existing roles/scopes by id; role/scope
   authoring is out of scope). The only server-backed source of the role and access-scope ids that exist
   in a tenant is the assignments already held by existing staff. So `listAssignableRoles` derives its
   options from the roles on existing staff summaries, and `listAssignableScopes` derives them from the
   scopes inside existing staff assignments (list + detail), deduped. **A role/scope that has never been
   assigned to anyone will not appear** — a documented V1 limitation, not fabricated data. See
   "Remaining after 2O".

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

| API code (SDK 0.10.0)        | Category            | Recovery |
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
role/scope-coupled assignments + timestamps); exact-email 0/1/N eligible lookup; Add-Staff (create →
assign, orchestrated); role/scope assign + unassign (re-read on success); membership lifecycle incl.
`invited`; read-only mode; anti-escalation / last-admin / conflict / idempotency error surfaces mapped to
the real codes.

**Remaining after 2O (product decisions, not blockers to this integration):**

- **No role/scope catalog endpoint in V1.** Assignable role/scope options are derived from the tenant's
  existing staff assignments (the only server-backed source). A role or scope that has never been
  assigned to anyone is not discoverable in the pickers, and role/scope **authoring** is out of scope. A
  future roles/scopes catalog endpoint would let the pickers list all assignable options directly.
- **Add-Staff creates the membership before assigning** (the API's `createStaff` is identity-only), so a
  role rejected by anti-escalation leaves a bare active membership. Assigning a permitted role/scope from
  the detail screen recovers it; a future single-call "create with initial assignment" endpoint would
  make it atomic.

**Non-goals:** HR / payroll; role creation/editing; permission editing; access-scope or branch/location
creation; and any Clerk invitation / email / password flow.

## Verification

Automated unit/component suite (Vitest): the SDK artifact/version/SHA; the **SDK-backed adapter mapping**
(list query pass-through + summary mapping; detail with role/scope coupling and target kinds; tenant vs
explicit scope; exact-email 0..N lookup incl. null-name fallback; create→assign orchestration with
derived keys; lifecycle/assign/unassign inputs; assignable role/scope **derivation** from existing
staff); typed capabilities incl. deny-by-default; the write-error categorisation against the real codes;
list loading/error/empty/populated + pagination + server search; read-only vs manage; detail rendering +
assignment coupling + lifecycle confirmation + deactivated readability + unassign; and the full Add-Staff
flow (exact-email lookup → explicit select → role → scope → review → create) with a blocked invalid
email, a neutral 0-result, a 1-result explicit confirm, a 2+ set that shows every match and auto-selects
none, no fake success, no directory/display-name search, and no raw-UUID entry.

Gate suite green: `pnpm install --frozen-lockfile`, `expo install --check`, `format:check`, `lint`,
`typecheck`, `test`, `build` (web export includes `/staff`, `/staff/new`, `/staff/[membershipId]`), and
`git diff --check`.

**Runtime acceptance (A–L):** see `docs/phase-2o-validation.md` for the disposable-API acceptance
harness (`acceptance/staff.runtime.tsx`) and results.
