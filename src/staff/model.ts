/**
 * Phase 2O Staff domain model — Admin-Mobile-owned, deliberately independent of any Staff SDK DTO.
 *
 * The Staff SDK contract is still being finalized (the API workstream is mid-review), so this app must
 * NOT import or guess unreleased Staff SDK types. This file defines the UX-facing vocabulary the
 * foundation is built against, so that final SDK integration is a NARROW mapping (SDK DTO → this model)
 * behind {@link ./adapter}, not a rewrite. It invents NO API property names and NO wire fields — these
 * names are the app's own. Normalization/validation here are UX conveniences only; the eventual API
 * remains the sole authority for persistence, uniqueness, authorization and every business rule.
 *
 * V1 concept (frozen platform invariants, see `current-v1-state.md` §C):
 *   `UserIdentity` != `Membership`   and   `Role` != `Permission` != `Scope`.
 * A Staff record is a PROJECTION over an existing tenant Membership plus its identity and its
 * authorization (role + access-scope assignments). This is operational access management, NOT HR:
 * there is deliberately no Employee/payroll model here.
 */

/**
 * Membership lifecycle, matching the API `StaffStatus` enum. `deactivated` is a revoked/terminal state
 * that stays READABLE (history is preserved) — there is no physical delete. `suspended` is a reversible
 * temporary disable. `invited` is an initial state (the API's `create_staff` links an already-provisioned
 * identity directly as `active`, so `invited` is rarely surfaced, but the list/detail contract can return
 * it and it must render as real data, never be coerced away).
 */
export type MembershipStatus = "invited" | "active" | "suspended" | "deactivated";

/**
 * The subset of {@link MembershipStatus} a manager may TRANSITION a membership to (mirrors the API's
 * `StaffStatusTarget`). `invited` is an initial state, never a transition target — a lifecycle control
 * always targets one of these.
 */
export type MembershipStatusTarget = "active" | "suspended" | "deactivated";

/** The kind of thing an access scope targets. Rendering of the target stays domain-driven, not guessed. */
export type AccessScopeKind = "tenant" | "brand" | "branch" | "location";

/**
 * A role reference as the UI needs it. Used both as a summary on a staff row/assignment and as an
 * assignable option in the pickers ({@link RoleOption} is the same shape). `permissionSummary` is a
 * short human hint where the adapter can supply one — never an authorization decision.
 */
export interface RoleSummary {
  id: string;
  label: string;
  permissionSummary?: string;
}

/** An assignable role option (identical shape to {@link RoleSummary}); named for intent at call sites. */
export type RoleOption = RoleSummary;

/**
 * An access-scope reference as the UI needs it. `targets` are already-human-readable lines the adapter
 * produced from the domain (e.g. `["Branch: Downtown", "Location: Main Stockroom"]`) so the screens
 * never re-derive branch/location naming. A tenant-wide scope has an empty `targets` list.
 */
export interface AccessScopeSummary {
  id: string;
  label: string;
  kind: AccessScopeKind;
  targets: string[];
}

/** An assignable access-scope option (identical shape); named for intent at call sites. */
export type AccessScopeOption = AccessScopeSummary;

/**
 * One authorization assignment. Authorization is conceptually Role + AccessScope PER assignment — the
 * two are coupled here, never presented as unrelated permanent staff properties. `isProtected` marks an
 * assignment the server may refuse to mutate (e.g. a protected administrator grant); the UI surfaces
 * that as a distinct, non-actionable state rather than silently offering a control that will 403.
 */
export interface StaffAssignment {
  assignmentId: string;
  role: RoleSummary;
  scope: AccessScopeSummary;
  isProtected?: boolean;
}

/** The compact shape a staff list row needs (a projection of {@link StaffDetail}). */
export interface StaffSummary {
  membershipId: string;
  identityId: string;
  displayName: string;
  primaryEmail?: string;
  status: MembershipStatus;
  /** At-a-glance role labels for the row. Full role+scope coupling lives on the detail. */
  roleSummaries: RoleSummary[];
  /** At-a-glance scope labels for the row. */
  scopeSummaries: AccessScopeSummary[];
}

/** Identity information as projected onto a staff record (never an HR/employee profile). */
export interface StaffIdentity {
  identityId: string;
  displayName: string;
  primaryEmail?: string;
  /** Identity lifecycle as the platform reports it (e.g. `active`), surfaced only when supplied. */
  identityStatus?: string;
}

/** A fully realized staff record as an adapter would return it. */
export interface StaffDetail {
  membershipId: string;
  identity: StaffIdentity;
  status: MembershipStatus;
  assignments: StaffAssignment[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * An EXISTING provisioned identity that can be linked to the tenant as staff. Add-Staff is a LINK of an
 * already-provisioned {@link StaffIdentity} — there is no Clerk invitation flow, no password, no email
 * send. Discovered only through the adapter's EXACT-EMAIL lookup (never a directory browse, a
 * display-name search, or raw-UUID entry as the normal UX).
 */
export interface EligibleIdentity {
  identityId: string;
  displayName: string;
  email?: string;
  /** Identity lifecycle (e.g. `active`), used to keep an obviously-unusable identity out of selection. */
  identityStatus: string;
}

/**
 * The input for creating a membership: link an existing identity with an initial Role + AccessScope.
 * These are IDs the operator picked from adapter-returned options — never fabricated or free-typed.
 */
export interface AddStaffInput {
  identityId: string;
  roleId: string;
  scopeId: string;
}

/** The input for adding one Role + AccessScope assignment to an existing membership. */
export interface RoleScopeAssignmentInput {
  roleId: string;
  scopeId: string;
}

// ---------------------------------------------------------------------------------------------------
// Presentation-side helpers (pure, UX-only)
// ---------------------------------------------------------------------------------------------------

/** A one-line role+scope description, making it clear which role applies at which scope. */
export function describeAssignment(assignment: StaffAssignment): string {
  return `${assignment.role.label} at ${assignment.scope.label}`;
}

/** True when the local Add-Staff selection is complete enough to submit (all three IDs chosen). */
export function isAddStaffComplete(selection: Partial<AddStaffInput>): selection is AddStaffInput {
  return Boolean(selection.identityId && selection.roleId && selection.scopeId);
}
