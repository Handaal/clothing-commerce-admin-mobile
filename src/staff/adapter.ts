/**
 * The narrow Staff integration seam — now backed by the real SDK 0.10.0 Staff surface.
 *
 * Phase 2O shipped the Admin-Mobile UX/domain foundation against this interface while the Staff API was
 * still under review; the API core has since landed (SDK 0.10.0). {@link resolveStaffAdapter} now returns
 * a concrete adapter that calls the tenant-scoped SDK client and maps its DTOs onto the local UI-domain
 * model ({@link ./model}). Every Staff screen still depends only on this interface and the local model,
 * never on the SDK — so the mapping lives here once and the screens stay transport-agnostic and directly
 * unit-testable. The adapter invents no endpoints and hand-writes no fetch client: the SDK owns the
 * transport, the tenant header and the `Idempotency-Key` header. It fabricates no staff data or fake
 * success — a failure surfaces as a classified error.
 *
 * TWO CONTRACT REALITIES shape this mapping:
 *
 * 1. `createStaff` takes ONLY `{ identityId }` — a new membership is created `active` with no assignment.
 *    So {@link StaffAdapter.addStaff} orchestrates the real two-step flow (createStaff → assignStaffRole)
 *    under one operator idempotency key (the assign step derives a stable `${key}-assign` sub-key), and
 *    returns the fresh authoritative detail.
 *
 * 2. There is NO role/scope CATALOG endpoint (V1 assigns existing roles/scopes by id; role/scope
 *    authoring is out of scope). The only server-backed source of the role and access-scope ids that
 *    exist in a tenant is the assignments already held by existing staff. So {@link
 *    StaffAdapter.listAssignableRoles}/{@link StaffAdapter.listAssignableScopes} DERIVE their options from
 *    existing staff (list + detail) rather than inventing a catalog. A role/scope that has never been
 *    assigned to anyone will not appear — a documented V1 limitation, not fabricated data.
 */

import { collectAllPages, type CursorPage, DEFAULT_MAX_PAGES } from "../commerce/pagination";
import type {
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
  AddStaffInput,
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
  addStaff(input: AddStaffInput, idempotencyKey: string): Promise<StaffDetail>;
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
function scopeKind(assignment: SdkStaffAssignment): AccessScopeKind {
  if (assignment.scopeMode === "tenant") return "tenant";
  const first = assignment.targets[0];
  switch (first?.kind) {
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

// ---------------------------------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------------------------------

/**
 * Resolve the SDK-backed Staff adapter for a tenant-scoped client. Always returns a concrete adapter now
 * that the Staff API exists (the seam still permits `null` so tests and any future gating can render an
 * explicit unavailable state without touching the screens).
 */
export function resolveStaffAdapter(client: TenantCommerceClient): StaffAdapter | null {
  /** Load every staff summary for the tenant (bounded, fail-closed) — the base for option derivation. */
  const loadAllSummaries = () =>
    collectAllPages<SdkStaffSummary>(
      (cursor) => client.listStaff(cursor ? { cursor } : {}),
      DEFAULT_MAX_PAGES,
    );

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

    async addStaff(input, idempotencyKey) {
      // The real API links the identity first (membership only), then assigns the initial role+scope.
      // Each step keeps its own at-most-once key; on an ambiguous retry the SAME base key replays both.
      const created = await client.createStaff({
        identityId: input.identityId,
        idempotencyKey,
      });
      const assigned = await client.assignStaffRole({
        membershipId: created.membershipId,
        roleId: input.roleId,
        accessScopeId: input.scopeId,
        idempotencyKey: `${idempotencyKey}-assign`,
      });
      return mapDetail(assigned);
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
      // Roles that exist in the tenant, derived from the roles already visible on staff summaries. This
      // is the only server-backed source (no role catalog endpoint in V1). Deduped by role id.
      const summaries = await loadAllSummaries();
      const byId = new Map<string, RoleOption>();
      for (const summary of summaries) {
        for (const role of summary.roles) {
          if (!byId.has(role.roleId))
            byId.set(role.roleId, { id: role.roleId, label: role.roleName });
        }
      }
      return [...byId.values()];
    },

    async listAssignableScopes() {
      // Access scopes only appear inside assignments (StaffDetail), so scope options are derived from the
      // assignments held by existing staff — the only server-backed source (no scope catalog in V1).
      const summaries = await loadAllSummaries();
      const details = await Promise.all(
        summaries.map((summary) => client.getStaffMember(summary.membershipId)),
      );
      const byId = new Map<string, AccessScopeOption>();
      for (const detail of details) {
        for (const assignment of detail.assignments) {
          if (!byId.has(assignment.accessScopeId))
            byId.set(assignment.accessScopeId, mapScope(assignment));
        }
      }
      return [...byId.values()];
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
