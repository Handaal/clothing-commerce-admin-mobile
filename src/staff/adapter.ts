/**
 * The narrow Staff integration seam — the boundary the whole foundation is built against.
 *
 * CONTRACT ISOLATION: the Staff SDK contract is still being finalized (the API workstream is mid
 * security review), so this file imports NO Staff SDK types, hand-writes NO HTTP, and invents NO
 * endpoints, DTOs, or error codes. Screens depend ONLY on {@link StaffAdapter} and the local UI-domain
 * model ({@link ./model}), so when the final `@shifted/clothing-commerce-sdk` staff surface lands, the
 * integration is a single new file that maps SDK DTOs onto these types — never a screen rewrite.
 *
 * PRODUCTION IS UNAVAILABLE BY DESIGN: {@link resolveStaffAdapter} returns `null` until the real Staff
 * SDK is integrated. A `null` adapter renders an explicit "unavailable" state — the app NEVER fabricates
 * staff data or a fake success. Test adapters are fake/in-memory (see `test-support/fixtures`).
 */

import type { CursorPage } from "../commerce/pagination";
import type {
  AccessScopeOption,
  AddStaffInput,
  EligibleIdentity,
  MembershipStatus,
  RoleOption,
  RoleScopeAssignmentInput,
  StaffDetail,
  StaffSummary,
} from "./model";
import type { EligibleIdentityQuery, StaffListQuery } from "./search";

/** List responses reuse the shared cursor-page envelope so the bounded paginator applies unchanged. */
export type StaffListPage = CursorPage<StaffSummary>;
export type EligibleIdentityPage = CursorPage<EligibleIdentity>;

/**
 * The complete set of Staff operations the foundation is built against. Write operations take an
 * app-supplied idempotency key, mirroring the inventory/catalog/supplier write discipline — the same
 * key is reused on an ambiguous retry so a write is applied at most once. Mutations return the fresh,
 * authoritative {@link StaffDetail} so the screen re-renders from the server, never a locally assumed
 * value. When the SDK lands it will own the transport, the tenant header and the `Idempotency-Key`
 * header; this app never sets headers itself.
 *
 * Names may be refined when the final Admin architecture/SDK is known; the shape is deliberately close
 * to the anticipated staff-projection operations (list / get / search-identities / add / lifecycle /
 * assign / unassign / list assignable roles / list assignable scopes).
 */
export interface StaffAdapter {
  listStaff(query: StaffListQuery): Promise<StaffListPage>;
  getStaff(membershipId: string): Promise<StaffDetail>;
  searchEligibleIdentities(query: EligibleIdentityQuery): Promise<EligibleIdentityPage>;
  addStaff(input: AddStaffInput, idempotencyKey: string): Promise<StaffDetail>;
  updateMembershipStatus(
    membershipId: string,
    status: MembershipStatus,
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

/**
 * Resolve the production Staff adapter. Returns `null` until the final Staff SDK is integrated — the
 * capability exists as a UI/domain foundation, but there is no real transport yet, so production shows
 * the explicit unavailable state rather than any fabricated data. This deliberately takes NO client:
 * wiring the tenant-scoped SDK client through is the narrow change made at integration time (the
 * signature will then become `resolveStaffAdapter(client)`, mirroring `resolveSupplierAdapter`).
 */
export function resolveStaffAdapter(): StaffAdapter | null {
  return null;
}
