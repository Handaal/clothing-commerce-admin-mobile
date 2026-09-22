import type { TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  IDENTITY_A,
  IDENTITY_B,
  MEMBERSHIP_STAFF_A,
  MEMBERSHIP_STAFF_B,
  ROLE_MANAGER,
  ROLE_STOCK,
  SCOPE_BRANCH,
  SCOPE_TENANT,
  sdkEligibleIdentitiesResponse,
  sdkEligibleIdentity,
  sdkStaffAssignment,
  sdkStaffDetail,
  sdkStaffListResponse,
  sdkStaffSummary,
} from "../test-support/fixtures";
import { resolveStaffAdapter } from "./adapter";

/** Minimal tenant-client stub carrying only the staff methods the adapter uses. */
function clientWith(overrides: Partial<TenantCommerceClient>): TenantCommerceClient {
  return overrides as TenantCommerceClient;
}

/** A non-null adapter (the seam permits null, but the real resolver always returns a concrete adapter). */
function adapterFor(overrides: Partial<TenantCommerceClient>) {
  const adapter = resolveStaffAdapter(clientWith(overrides));
  if (!adapter) throw new Error("expected a concrete staff adapter");
  return adapter;
}

describe("resolveStaffAdapter — SDK 0.10.0 mapping", () => {
  it("is always a concrete adapter now the Staff API exists", () => {
    expect(resolveStaffAdapter(clientWith({}))).not.toBeNull();
  });

  it("maps the list response and passes search/status/role/cursor through as the server query", async () => {
    const listStaff = vi.fn().mockResolvedValue(
      sdkStaffListResponse([sdkStaffSummary({ displayName: null, email: "only@acme.example" })], {
        nextCursor: "c2",
        hasMore: true,
      }),
    );
    const adapter = adapterFor({ listStaff });
    const page = await adapter.listStaff({
      search: "layla",
      status: "active",
      roleId: ROLE_MANAGER,
      cursor: "c1",
    });

    expect(listStaff).toHaveBeenCalledWith({
      search: "layla",
      status: "active",
      roleId: ROLE_MANAGER,
      cursor: "c1",
    });
    expect(page.pageInfo).toEqual({ nextCursor: "c2", hasMore: true });
    const [row] = page.items;
    // display name falls back to the email; roles map to summaries; summaries carry no scopes.
    expect(row.displayName).toBe("only@acme.example");
    expect(row.roleSummaries).toEqual([{ id: ROLE_MANAGER, label: "Branch Manager" }]);
    expect(row.scopeSummaries).toEqual([]);
  });

  it("omits absent query constraints so the SDK maps them straight onto query params", async () => {
    const listStaff = vi.fn().mockResolvedValue(sdkStaffListResponse());
    await adapterFor({ listStaff }).listStaff({});
    expect(listStaff).toHaveBeenCalledWith({});
  });

  it("maps staff detail, coupling each role with its scope and its target kinds", async () => {
    const getStaffMember = vi.fn().mockResolvedValue(
      sdkStaffDetail({
        email: null,
        assignments: [
          sdkStaffAssignment({
            scopeMode: "explicit",
            scopeName: "Downtown Branch",
            targets: [
              { kind: "branch", id: "16161616-1616-4161-8161-161616161616" },
              { kind: "inventory_location", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
            ],
            isProtectedRole: true,
          }),
        ],
      }),
    );
    const detail = await adapterFor({ getStaffMember }).getStaff(MEMBERSHIP_STAFF_A);
    expect(getStaffMember).toHaveBeenCalledWith(MEMBERSHIP_STAFF_A);
    const [assignment] = detail.assignments;
    expect(assignment.role.label).toBe("Branch Manager");
    expect(assignment.scope.label).toBe("Downtown Branch");
    expect(assignment.scope.kind).toBe("branch");
    expect(assignment.scope.targets).toEqual(["Branch", "Inventory location"]);
    expect(assignment.isProtected).toBe(true);
  });

  it("maps a tenant-mode scope to a tenant-wide scope with no target lines", async () => {
    const getStaffMember = vi.fn().mockResolvedValue(
      sdkStaffDetail({
        assignments: [
          sdkStaffAssignment({ scopeMode: "tenant", scopeName: "Whole business", targets: [] }),
        ],
      }),
    );
    const detail = await adapterFor({ getStaffMember }).getStaff(MEMBERSHIP_STAFF_A);
    expect(detail.assignments[0].scope.kind).toBe("tenant");
    expect(detail.assignments[0].scope.targets).toEqual([]);
  });

  it("maps the exact-email eligible lookup to a 0..N list (no directory browse)", async () => {
    const findEligibleStaffIdentitiesByEmail = vi
      .fn()
      .mockResolvedValue(
        sdkEligibleIdentitiesResponse([
          sdkEligibleIdentity({ identityId: IDENTITY_B, displayName: "Omar Fathy" }),
          sdkEligibleIdentity({ identityId: IDENTITY_A, displayName: null, primaryEmail: null }),
        ]),
      );
    const identities = await adapterFor({
      findEligibleStaffIdentitiesByEmail,
    }).findEligibleIdentitiesByEmail("omar@acme.example");
    expect(findEligibleStaffIdentitiesByEmail).toHaveBeenCalledWith({ email: "omar@acme.example" });
    expect(identities).toHaveLength(2);
    expect(identities[0]).toEqual({
      identityId: IDENTITY_B,
      displayName: "Omar Fathy",
      email: "omar@acme.example",
      identityStatus: "active",
    });
    // A null name and null email fall back to a neutral placeholder, never a fabricated value.
    expect(identities[1].displayName).toBe("(no name)");
    expect(identities[1].email).toBeUndefined();
  });

  it("returns an empty list for a zero-result lookup (the neutral not-eligible state)", async () => {
    const findEligibleStaffIdentitiesByEmail = vi
      .fn()
      .mockResolvedValue(sdkEligibleIdentitiesResponse([]));
    const identities = await adapterFor({
      findEligibleStaffIdentitiesByEmail,
    }).findEligibleIdentitiesByEmail("missing@acme.example");
    expect(identities).toEqual([]);
  });

  it("adds staff as the real two-step flow: create membership, then assign role+scope under derived keys", async () => {
    const createStaff = vi.fn().mockResolvedValue(sdkStaffDetail({ assignments: [] }));
    const assignStaffRole = vi.fn().mockResolvedValue(sdkStaffDetail());
    const detail = await adapterFor({ createStaff, assignStaffRole }).addStaff(
      { identityId: IDENTITY_B, roleId: ROLE_MANAGER, scopeId: SCOPE_BRANCH },
      "K1",
    );
    expect(createStaff).toHaveBeenCalledWith({ identityId: IDENTITY_B, idempotencyKey: "K1" });
    expect(assignStaffRole).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_STAFF_A,
      roleId: ROLE_MANAGER,
      accessScopeId: SCOPE_BRANCH,
      idempotencyKey: "K1-assign",
    });
    // The final, authoritative detail (post-assignment) is what the screen renders.
    expect(detail.assignments).toHaveLength(1);
  });

  it("maps lifecycle, assign and unassign onto the SDK write inputs (idempotency key carried through)", async () => {
    const updateStaffStatus = vi.fn().mockResolvedValue(sdkStaffDetail({ status: "suspended" }));
    const assignStaffRole = vi.fn().mockResolvedValue(sdkStaffDetail());
    const unassignStaffRole = vi.fn().mockResolvedValue(sdkStaffDetail({ assignments: [] }));
    const adapter = adapterFor({ updateStaffStatus, assignStaffRole, unassignStaffRole });

    await adapter.updateMembershipStatus(MEMBERSHIP_STAFF_A, "suspended", "K2");
    expect(updateStaffStatus).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_STAFF_A,
      status: "suspended",
      idempotencyKey: "K2",
    });

    await adapter.assignRoleScope(
      MEMBERSHIP_STAFF_A,
      { roleId: ROLE_STOCK, scopeId: SCOPE_TENANT },
      "K3",
    );
    expect(assignStaffRole).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_STAFF_A,
      roleId: ROLE_STOCK,
      accessScopeId: SCOPE_TENANT,
      idempotencyKey: "K3",
    });

    await adapter.unassignRoleScope(MEMBERSHIP_STAFF_A, "assign-1", "K4");
    expect(unassignStaffRole).toHaveBeenCalledWith({
      membershipId: MEMBERSHIP_STAFF_A,
      assignmentId: "assign-1",
      idempotencyKey: "K4",
    });
  });

  it("derives assignable roles from existing staff summaries (the only server-backed source), deduped", async () => {
    const listStaff = vi.fn().mockResolvedValue(
      sdkStaffListResponse([
        sdkStaffSummary({
          membershipId: MEMBERSHIP_STAFF_A,
          roles: [{ roleId: ROLE_MANAGER, roleName: "Branch Manager", isProtected: false }],
        }),
        sdkStaffSummary({
          membershipId: MEMBERSHIP_STAFF_B,
          roles: [
            { roleId: ROLE_MANAGER, roleName: "Branch Manager", isProtected: false },
            { roleId: ROLE_STOCK, roleName: "Stock Clerk", isProtected: false },
          ],
        }),
      ]),
    );
    const roles = await adapterFor({ listStaff }).listAssignableRoles();
    expect(roles).toEqual([
      { id: ROLE_MANAGER, label: "Branch Manager" },
      { id: ROLE_STOCK, label: "Stock Clerk" },
    ]);
  });

  it("derives assignable scopes from existing staff assignments (details), deduped", async () => {
    const listStaff = vi
      .fn()
      .mockResolvedValue(
        sdkStaffListResponse([
          sdkStaffSummary({ membershipId: MEMBERSHIP_STAFF_A }),
          sdkStaffSummary({ membershipId: MEMBERSHIP_STAFF_B }),
        ]),
      );
    const getStaffMember = vi.fn(async (membershipId: string) =>
      sdkStaffDetail({
        membershipId,
        assignments: [
          sdkStaffAssignment({
            accessScopeId: membershipId === MEMBERSHIP_STAFF_A ? SCOPE_BRANCH : SCOPE_TENANT,
            scopeMode: membershipId === MEMBERSHIP_STAFF_A ? "explicit" : "tenant",
            scopeName: membershipId === MEMBERSHIP_STAFF_A ? "Downtown Branch" : "Whole business",
            targets:
              membershipId === MEMBERSHIP_STAFF_A
                ? [{ kind: "branch", id: "16161616-1616-4161-8161-161616161616" }]
                : [],
          }),
        ],
      }),
    );
    const scopes = await adapterFor({ listStaff, getStaffMember }).listAssignableScopes();
    expect(scopes.map((scope) => scope.id)).toEqual([SCOPE_BRANCH, SCOPE_TENANT]);
    expect(scopes.find((scope) => scope.id === SCOPE_TENANT)?.kind).toBe("tenant");
  });
});
