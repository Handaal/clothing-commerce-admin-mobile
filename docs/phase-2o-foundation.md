# Phase 2O — Staff management (foundation)

**Status: UI/domain FOUNDATION only — deliberately NOT the real API integration pass.** The Staff
SDK contract was still being finalized (a parallel API workstream under security review) when this was
built, so Admin Mobile ships a strong, adapter-isolated foundation that the final Staff SDK will plug
into through one narrow mapping. **The production Staff adapter is unavailable (`null`) and every Staff
screen renders an explicit "unavailable" state until the SDK is integrated.** Nothing fabricates staff
data or a fake success.

This mirrors how Phase 2N (suppliers) was delivered: foundation first, then a mapping-only integration
once the API froze.

## V1 staff concept

Staff is **operational platform access management, not HR**. It respects the frozen platform invariants
(`current-v1-state.md` §C): `UserIdentity` != `Membership` and `Role` != `Permission` != `Scope`. A
Staff UI record is a **projection** over an existing tenant Membership plus its identity and its
authorization (role + access-scope assignments). There is deliberately **no Employee/payroll model**.

## Local UI-domain model (`src/staff/model.ts`)

Admin-owned types, independent of any Staff SDK DTO (imports none): `StaffSummary`, `StaffDetail`,
`StaffIdentity`, `EligibleIdentity`, `RoleSummary`/`RoleOption`, `AccessScopeSummary`/`AccessScopeOption`,
`StaffAssignment` (Role + AccessScope **coupled per assignment**), `MembershipStatus`
(`active` / `suspended` / `deactivated`), and the `AddStaffInput` / `RoleScopeAssignmentInput` write
inputs. These are the app's own vocabulary — not a claimed contract.

## Adapter seam (`src/staff/adapter.ts`)

One `StaffAdapter` interface is the whole boundary: `listStaff`, `getStaff`,
`findEligibleIdentityByEmail`, `addStaff`, `updateMembershipStatus`, `assignRoleScope`,
`unassignRoleScope`, `listAssignableRoles`, `listAssignableScopes`. Screens depend **only** on this
interface and the local model, never on the SDK. Writes take an app-supplied idempotency key and return
the fresh authoritative `StaffDetail`. Identity discovery is `findEligibleIdentityByEmail(email)`, which
returns the single eligible account **or `null`** — never a list — so the screen cannot browse or
enumerate the global identity directory.

`resolveStaffAdapter()` returns **`null`** — production is unavailable by design. It imports no Staff
SDK types, hand-writes no HTTP, and invents no endpoints/DTOs/error codes. Test adapters are the only
fakes (`fakeStaffAdapter` in `src/test-support/fixtures.ts`). At integration time the signature becomes
`resolveStaffAdapter(client)` and a single new mapping file is added — no screen rewrite.

## Capability seam (`src/staff/capabilities.ts`)

The final `/me/context` staff contract is **not frozen**, and the vendored SDK (`0.9.0`) does not yet
type `access.staff`. So **all** staff-context guessing is isolated in one helper, `staffCapabilities`,
which reads `access.staff` **structurally** into a stable `{ canRead, canManage }` (deny-by-default when
absent). When the DTO lands, this is the single place to retype. `canRead` gates the **Manage staff**
navigation entry; `canManage` gates Add-Staff and every mutation control. The API remains the sole
authority — a hidden control is never the security boundary, and a real `403` surfaces distinctly.

## Screens & components

- **Staff list** (`StaffListScreen.tsx`): loading / error / empty / populated, server-side
  search + status filter (+ optional role filter when role options are supplied), bounded cursor
  pagination via the shared paginator. Rows show display name, email, status, and role + scope summary.
  Query state is explicit (`search.ts`) so SDK integration is narrow; no client-side filtering.
- **Staff detail** (`StaffDetailScreen.tsx`): identity, membership status, and assignments rendered as
  **Role + AccessScope pairs** (`StaffAssignmentList.tsx`) — clear which role applies at which scope. A
  **deactivated** membership stays fully readable and offers **no delete**. Lifecycle actions
  (`MembershipStatusActions.tsx`) and an add-assignment panel appear only for a manager.
- **Add-Staff flow** (`AddStaffFlow.tsx`): four steps — (1) find an **existing** account by its **exact
  email** and confirm it (`EligibleIdentityLookup.tsx`), (2) choose a role (`RoleSelector.tsx`), (3)
  choose an **existing** access scope (`AccessScopeSelector.tsx`), (4) review + create. **Add-Staff links
  an existing provisioned identity** — no Clerk invite, no email send, no password, and **no raw-UUID
  entry** as the normal UX. Identity discovery is an **exact-email lookup** — there is no directory
  browse, no display-name search, and no wildcard.

  ### Exact-email eligible-account lookup (frozen V1 privacy decision)

  The identity step is an **exact, existing-account email lookup**, not a directory search. The operator
  types an email → taps **Find account** → the single eligible account is shown to confirm, or one
  neutral message appears: **"No eligible account was found for this email."** That one message covers
  every not-eligible case (no such account / inactive identity / already a staff member) — the screen
  **never distinguishes** them and so cannot be used to probe who exists on the platform. The email is
  validated (and trimmed/lowercased for convenience) **before** the adapter is called (`search.ts`:
  `buildEligibleEmailLookup`); an invalid email is blocked at the UX level and never reaches the adapter.
  There is **no global identity directory browse, no display-name search, no wildcard, and no raw-UUID
  workflow**. This is a UX convenience only — the server remains the sole authority for matching and is
  not assumed to normalize the same way. There is still **no Clerk invitation / email send**.

- Routes: `app/staff/index.tsx`, `app/staff/[membershipId].tsx`, `app/staff/new.tsx`; navigation entry
  in `app/index.tsx`.

## Roles, scopes & assignment presentation

Roles and scopes are **existing** platform objects, always adapter-driven. The UI never authors roles,
edits permissions, or creates scopes / branch-location targets. Scope target rendering is
domain-driven (`scopes.ts`): tenant-wide reads as "Tenant-wide"; a narrower scope shows the adapter's
human-readable target lines (e.g. "Branch: Downtown", "Location: Main Stockroom"). Because the server
enforces anti-escalation, a visible role/scope is **never assumed assignable** until the API accepts it.

## Membership lifecycle

`active` (normal access), `suspended` (reversible temporary disable), `deactivated` (revoked/terminal;
retained + readable, **never a physical delete**). Destructive transitions require a confirmation;
from `deactivated` the UI offers no lifecycle action (the server owns any reactivation rule).

## Read-only mode

With `staff.read = true`, `staff.manage = false`: list + detail remain available; Add-Staff, role/scope
mutation, and lifecycle controls are all withheld. Proven even before the final context DTO exists.

## Anti-escalation / last-admin error seams (`src/staff/write-errors.ts`)

Distinct **local semantic categories** — `cannot-delegate`, `last-admin`, `foreign-scope`,
`protected-assignment`, `membership-exists`, `identity-not-found`, plus `invalid` / `session` / `denied`
/ `conflict` / `not-found` / `ambiguous` — each with its own heading, message and recovery. No exact API
codes are invented: the provisional codes live in one place (`PROVISIONAL_STAFF_ERROR_CODES`) to be
reconciled with the final SDK. A known business code is deterministic and matched before the ambiguous
transport fallback; `IDEMPOTENCY_CONFLICT` is never hidden. Idempotency/retry reuse the shared
`useMutation` discipline (same key on ambiguous retry → at-most-once).

## Implemented now vs waiting for final API

**Implemented now:** staff management UI foundation; local UI-domain types; the adapter boundary
(`null` in production); capability seam; list; detail; Add-Staff workflow UX; role/scope assignment UX;
membership lifecycle UX; read-only behaviour; anti-escalation/last-admin error surfaces.

**Waiting for the final API contract:**

- the real Staff SDK (`listStaff` / `getStaffMember` / `createStaff` / `updateStaffStatus` /
  `assignStaffRole` / `unassignStaffRole` or their final names) and a concrete `resolveStaffAdapter`;
- the exact `/me/context` staff capability shape (retype `capabilities.ts`);
- the exact **eligible-account email-lookup** endpoint + DTO (the exact-email lookup contract — request
  shape and the eligible-account projection — is still being finalized by the API workstream);
- the exact assignable-roles / assignable-scopes endpoints and the assignment/lifecycle endpoints;
- the exact typed error codes (reconcile `PROVISIONAL_STAFF_ERROR_CODES`).

**Non-goals:** HR / payroll; role creation/editing; permission editing; access-scope or branch/location
creation; and any Clerk invitation / email / password flow.

## Verification

Automated unit/component suite (Vitest): domain model, search/query mapping, lifecycle, scope
presentation, the defensive capability read, the unavailable production adapter, the write-error
categorisation (incl. anti-escalation/last-admin/foreign-scope/protected/membership-exists), list
loading/error/empty/populated + pagination + server search, read-only vs manage, detail rendering +
assignment coupling + lifecycle confirmation + deactivated readability + unassign, and the full
Add-Staff step flow (exact-email account lookup → confirm → role → scope → review → create) with a
blocked invalid email, a neutral no-result, no fake success, no directory/display-name search, and no
raw-UUID entry. All fakes are test-only; production stays unavailable.

**No real Staff runtime API acceptance yet** — by design, the SDK is not integrated. Gate suite green:
`pnpm install --frozen-lockfile`, `expo install --check`, `format:check`, `lint`, `typecheck`, `test`,
`build` (web export includes `/staff`, `/staff/new`, `/staff/[membershipId]`), and `git diff --check`.
