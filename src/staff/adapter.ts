/**
 * The narrow Staff integration seam — backed by the real SDK 0.11.0 Staff surface.
 *
 * Phase 2O shipped the Admin-Mobile UX/domain foundation against this interface while the Staff API was
 * still under review; the API core (SDK 0.10.0) and then the assignment catalogs (SDK 0.11.0) have since
 * landed. {@link resolveStaffAdapter} returns a concrete adapter that calls the tenant-scoped SDK client
 * and maps its DTOs onto the local UI-domain model ({@link ./model}). Every Staff screen still depends
 * only on this interface and the local model, never on the SDK — so the mapping lives here once and the
 * screens stay transport-agnostic and directly unit-testable. The adapter invents no endpoints and
 * hand-writes no fetch client: the SDK owns the transport, the tenant header and the `Idempotency-Key`
 * header. It fabricates no staff data or fake success — a failure surfaces as a classified error.
 *
 * TWO CONTRACT REALITIES shape this mapping:
 *
 * 1. `createStaff` takes ONLY `{ identityId }` — a new membership is created `active` with no assignment.
 *    The Add-Staff workflow therefore runs the real two-step flow (createStaff → assignStaffRole) as two
 *    INDEPENDENT operations so a create success is never lost when the assign step fails: the adapter
 *    exposes {@link StaffAdapter.createStaffMembership} and {@link StaffAdapter.assignRoleScope}
 *    separately, each with its own idempotency key, and the screen orchestrates and recovers between them.
 *
 * 2. The role and access-scope options come from the CANONICAL server catalogs
 *    (`listAssignableStaffRoles` / `listAssignableStaffScopes`, SDK 0.11.0) — the single source of the
 *    role ids and access-scope ids `assignStaffRole` accepts. {@link StaffAdapter.listAssignableRoles} /
 *    {@link StaffAdapter.listAssignableScopes} read those catalogs (following server pagination). Options
 *    are NEVER derived from the assignments other staff already hold: that derivation is empty on a fresh
 *    tenant, silently drops valid-but-unused roles/scopes, and makes one member's options depend on
 *    another member's memberships. The catalogs are selection surfaces only — the server re-runs every
 *    authorization check on the write, so a visible option is never assumed to be assignable.
 */

import { collectAllPages, type CursorPage, DEFAULT_MAX_PAGES } from "../commerce/pagination";
import type {
  AssignableStaffRole as SdkAssignableStaffRole,
  AssignableStaffScope as SdkAssignableStaffScope,
  EligibleIdentity as SdkEligibleIdentity,
  StaffAssignment as SdkStaffAssignment,
  StaffDetail as SdkStaffDetail,
  StaffSummary as SdkStaffSummary,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";

import type {
  AccessScopeKind,
  AccessScopeOption,
  AccessScopeSummary,
  EligibleIdentity,
  MembershipStatusTarget,
  RoleOption,
  RoleScopeAssignmentInput,
  StaffAssignment,
  StaffDetail,
  StaffSummary,
} from "./model";
import type { StaffListQuery } from "./search";

/** List responses reuse the shared cursor-page envelope so the bounded paginator applies unchanged. */
export type StaffListPage = CursorPage<StaffSummary>;

/**
 * The complete set of Staff operations the foundation is built against. Write operations take an
 * app-supplied idempotency key, mirroring the inventory/catalog/supplier write discipline — the same key
 * is reused on an ambiguous retry so a write is applied at most once. Mutations return the fresh,
 * authoritative {@link StaffDetail} so the screen re-renders from the server, never a locally assumed
 * value. The SDK owns the transport, the tenant header and the `Idempotency-Key` header.
 *
 * IDENTITY DISCOVERY IS EXACT-EMAIL LOOKUP (frozen V1 privacy decision): Add-Staff resolves existing
 * account(s) by an EXACT email, never by browsing/searching the global identity directory. Because a
 * platform `primary_email` is NOT globally unique, the lookup returns 0..N eligible accounts as a list.
 * An EMPTY list is the single neutral "not eligible" result; 2+ requires explicit manager selection.
 */
export interface StaffAdapter {
  listStaff(query: StaffListQuery): Promise<StaffListPage>;
  getStaff(membershipId: string): Promise<StaffDetail>;
  findEligibleIdentitiesByEmail(email: string): Promise<EligibleIdentity[]>;
  /**
   * Step 1 of Add-Staff: link an existing identity as a membership (no assignment yet — a membership with
   * zero assignments has zero effective permissions, so this is security-safe on its own). Returned
   * authoritative detail carries the new `membershipId` the caller then assigns a role+scope to via
   * {@link assignRoleScope}. Kept SEPARATE from the assign step so a create success is never lost when
   * the assign step fails and can be recovered without re-creating the membership.
   */
  createStaffMembership(identityId: string, idempotencyKey: string): Promise<StaffDetail>;
  updateMembershipStatus(
    membershipId: string,
    status: MembershipStatusTarget,
    idempotencyKey: string,
  ): Promise<StaffDetail>;
  assignRoleScope(
    membershipId: string,
    input: RoleScopeAssignmentInput,
    idempotencyKey: string,
  ): Promise<StaffDetail>;
  unassignRoleScope(
    membershipId: string,
    assignmentId: string,
    idempotencyKey: string,
  ): Promise<StaffDetail>;
  listAssignableRoles(): Promise<RoleOption[]>;
  listAssignableScopes(): Promise<AccessScopeOption[]>;
}

// ---------------------------------------------------------------------------------------------------
// SDK DTO → local UI-domain model mapping
// ---------------------------------------------------------------------------------------------------

/** A never-empty display name: the SDK name, else the email, else a neutral placeholder. */
function displayNameOf(name: string | null, email: string | null): string {
  return name ?? email ?? "(no name)";
}

/**
 * Map an SDK access-scope kind onto the local presentation kind. The SDK carries scope `mode`
 * (`tenant`/`explicit`) plus per-target kinds (`brand`/`branch`/`warehouse`/`inventory_location`); the
 * local model's single `kind` is only used to decide "tenant-wide vs narrower" and a fallback label, so a
 * `tenant` mode maps to `tenant` and an explicit scope takes the shape of its first target.
 */
function resolveScopeKind(
  scopeMode: "tenant" | "explicit",
  firstTargetKind: SdkStaffAssignment["targets"][number]["kind"] | undefined,
): AccessScopeKind {
  if (scopeMode === "tenant") return "tenant";
  switch (firstTargetKind) {
    case "brand":
      return "brand";
    case "branch":
      return "branch";
    case "warehouse":
    case "inventory_location":
      return "location";
    default:
      return "branch";
  }
}

function scopeKind(assignment: SdkStaffAssignment): AccessScopeKind {
  return resolveScopeKind(assignment.scopeMode, assignment.targets[0]?.kind);
}

/** Human label for an SDK target kind — real kinds only, never an invented target name. */
function targetKindLabel(kind: SdkStaffAssignment["targets"][number]["kind"]): string {
  switch (kind) {
    case "brand":
      return "Brand";
    case "branch":
      return "Branch";
    case "warehouse":
      return "Warehouse";
    case "inventory_location":
      return "Inventory location";
  }
}

/**
 * The SDK's assignment targets are `{ kind, id }` with no human name, so we surface the distinct target
 * KINDS as readable lines (e.g. "Branch", "Inventory location") — the scope's own `scopeName` carries the
 * human identity. We never fabricate a target name from an id.
 */
function scopeTargetLines(assignment: SdkStaffAssignment): string[] {
  const labels = assignment.targets.map((target) => targetKindLabel(target.kind));
  return [...new Set(labels)];
}

function mapScope(assignment: SdkStaffAssignment): AccessScopeSummary {
  return {
    id: assignment.accessScopeId,
    label: assignment.scopeName,
    kind: scopeKind(assignment),
    targets: assignment.scopeMode === "tenant" ? [] : scopeTargetLines(assignment),
  };
}

function mapAssignment(assignment: SdkStaffAssignment): StaffAssignment {
  return {
    assignmentId: assignment.assignmentId,
    role: {
      id: assignment.roleId,
      label: assignment.roleName,
      ...(assignment.permissionKeys.length > 0
        ? { permissionSummary: assignment.permissionKeys.join(", ") }
        : {}),
    },
    scope: mapScope(assignment),
    ...(assignment.isProtectedRole ? { isProtected: true } : {}),
  };
}

function mapDetail(dto: SdkStaffDetail): StaffDetail {
  return {
    membershipId: dto.membershipId,
    identity: {
      identityId: dto.identityId,
      displayName: displayNameOf(dto.displayName, dto.email),
      ...(dto.email !== null ? { primaryEmail: dto.email } : {}),
    },
    status: dto.status,
    assignments: dto.assignments.map(mapAssignment),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

function mapEligible(dto: SdkEligibleIdentity): EligibleIdentity {
  return {
    identityId: dto.identityId,
    displayName: displayNameOf(dto.displayName, dto.primaryEmail),
    ...(dto.primaryEmail !== null ? { email: dto.primaryEmail } : {}),
    identityStatus: dto.status,
  };
}

/**
 * Map a canonical assignable-role catalog entry onto the local {@link RoleOption}. `permissionKeys` is
 * surfaced as a short human hint of what the role confers before assigning it — never an authorization
 * decision (the server re-checks the subset rule on the write).
 */
function mapRoleOption(role: SdkAssignableStaffRole): RoleOption {
  return {
    id: role.roleId,
    label: role.roleName,
    ...(role.permissionKeys.length > 0
      ? { permissionSummary: role.permissionKeys.join(", ") }
      : {}),
  };
}

/**
 * A human target line for a catalog scope target. Unlike a StaffDetail assignment target (id-only), the
 * catalog projects the CANONICAL `name` the API read from the referenced brand/branch/warehouse/location,
 * so the line reads e.g. "Branch: Downtown" — a real name, never one fabricated from an id.
 */
function catalogTargetLine(target: SdkAssignableStaffScope["targets"][number]): string {
  return `${targetKindLabel(target.kind)}: ${target.name}`;
}

/** Map a canonical assignable-scope catalog entry onto the local {@link AccessScopeOption}. */
function mapScopeOption(scope: SdkAssignableStaffScope): AccessScopeOption {
  return {
    id: scope.accessScopeId,
    label: scope.scopeName,
    kind: resolveScopeKind(scope.scopeMode, scope.targets[0]?.kind),
    // A tenant-mode scope has no targets by construction; an explicit scope lists its named targets.
    targets: scope.scopeMode === "tenant" ? [] : scope.targets.map(catalogTargetLine),
  };
}

// ---------------------------------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------------------------------

/**
 * Resolve the SDK-backed Staff adapter for a tenant-scoped client. Always returns a concrete adapter now
 * that the Staff API exists (the seam still permits `null` so tests and any future gating can render an
 * explicit unavailable state without touching the screens).
 */
export function resolveStaffAdapter(client: TenantCommerceClient): StaffAdapter | null {
  return {
    async listStaff(query) {
      const response = await client.listStaff({
        ...(query.search ? { search: query.search } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.roleId ? { roleId: query.roleId } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      });
      return {
        items: response.items.map((item) => mapListItem(item)),
        pageInfo: response.pageInfo,
      };
    },

    async getStaff(membershipId) {
      return mapDetail(await client.getStaffMember(membershipId));
    },

    async findEligibleIdentitiesByEmail(email) {
      const response = await client.findEligibleStaffIdentitiesByEmail({ email });
      return response.items.map(mapEligible);
    },

    async createStaffMembership(identityId, idempotencyKey) {
      // Step 1: link the identity as a membership only (no assignment). A membership with zero
      // assignments has zero effective permissions, so this is security-safe on its own. The screen
      // then assigns the initial role+scope via `assignRoleScope` under an INDEPENDENT idempotency key,
      // so a create success is never lost and is never re-created if the assign step fails.
      return mapDetail(await client.createStaff({ identityId, idempotencyKey }));
    },

    async updateMembershipStatus(membershipId, status, idempotencyKey) {
      return mapDetail(await client.updateStaffStatus({ membershipId, status, idempotencyKey }));
    },

    async assignRoleScope(membershipId, input, idempotencyKey) {
      return mapDetail(
        await client.assignStaffRole({
          membershipId,
          roleId: input.roleId,
          accessScopeId: input.scopeId,
          idempotencyKey,
        }),
      );
    },

    async unassignRoleScope(membershipId, assignmentId, idempotencyKey) {
      return mapDetail(
        await client.unassignStaffRole({ membershipId, assignmentId, idempotencyKey }),
      );
    },

    async listAssignableRoles() {
      // The CANONICAL server-backed catalog of assignable roles (SDK 0.11.0). This is the single source
      // of the role ids `assignStaffRole` accepts — options are NEVER derived from other staff members'
      // assignments (that is empty on a fresh tenant and silently hides valid-but-unused roles). Server
      // pagination is followed to completion (bounded, fail-closed) since the picker needs every option.
      const roles = await collectAllPages<SdkAssignableStaffRole>(
        (cursor) => client.listAssignableStaffRoles(cursor ? { cursor } : {}),
        DEFAULT_MAX_PAGES,
      );
      return roles.map(mapRoleOption);
    },

    async listAssignableScopes() {
      // The CANONICAL server-backed catalog of assignable access scopes (SDK 0.11.0) — the single source
      // of the access-scope ids `assignStaffRole` accepts, never derived from existing assignments. Each
      // explicit scope carries its named targets; server pagination is followed to completion.
      const scopes = await collectAllPages<SdkAssignableStaffScope>(
        (cursor) => client.listAssignableStaffScopes(cursor ? { cursor } : {}),
        DEFAULT_MAX_PAGES,
      );
      return scopes.map(mapScopeOption);
    },
  };
}

/** List item mapping split out so the summary → local `StaffSummary` shape stays explicit and typed. */
function mapListItem(dto: SdkStaffSummary): StaffSummary {
  return {
    membershipId: dto.membershipId,
    identityId: dto.identityId,
    displayName: displayNameOf(dto.displayName, dto.email),
    ...(dto.email !== null ? { primaryEmail: dto.email } : {}),
    status: dto.status,
    // SDK summaries carry roles but no scopes; the row shows role labels and no scope summary.
    roleSummaries: dto.roles.map((role) => ({ id: role.roleId, label: role.roleName })),
    scopeSummaries: [],
  };
}
