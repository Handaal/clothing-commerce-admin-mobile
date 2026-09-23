import { ApiNetworkError, createCommerceClient } from "@shifted/clothing-commerce-sdk";
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { SessionProvider, useSession } from "../src/session/SessionProvider";
import { resolveStaffAdapter, type StaffAdapter } from "../src/staff/adapter";
import { staffCapabilities } from "../src/staff/capabilities";
import { AddStaffFlow } from "../src/staff/AddStaffFlow";
import { StaffDetailScreen } from "../src/staff/StaffDetailScreen";
import { StaffListScreen } from "../src/staff/StaffListScreen";
import { createMemoryTenantStorage } from "../src/tenant/storage";

// Phase 2O staff runtime acceptance. This suite drives the REAL application UI against the REAL merged
// Staff API (SDK 0.11.0, incl. the canonical assignment catalogs). Only the device auth/storage adapters
// are substituted; bootstrap, `/me/context`, the SDK, HTTP transport and server-side authorization are
// all real. The `scripts/test-staff.mjs` orchestration wrapper (API repo) provisions a disposable
// loopback API, a Clerk-verifiable session token, and the staff fixtures the scenarios need — exactly as
// the Phase 2L/2M/2N runtime suites are run. It NEVER targets production. Without that provisioning
// `beforeAll` throws and the suite does not run.
//
// Scenario → required fixture (set the matching env var to enable a fixture-gated scenario):
//   A/F/I/L  — STAFF_TEST_TOKEN is a tenant-wide `staff.manage` admin with at least one existing staff
//              member (so list/detail render).
//   B/C/D/E  — STAFF_TEST_ELIGIBLE_EMAIL is an active identity with NO membership in the tenant.
//   D/N/G    — role and access-scope options come from the CANONICAL server catalogs
//              (`listAssignableStaffRoles`/`listAssignableStaffScopes`), NEVER derived from other members'
//              assignments: an unused role/scope still appears (N), a non-delegable role does not (G).
//   C (N=n)  — STAFF_TEST_DUP_EMAIL is an email shared by 2+ eligible identities (optional).
//   M        — STAFF_TEST_PARTIAL_EMAIL is a fresh active non-member reserved for the create-succeeds /
//              assign-fails recovery proof (the assignment failure is injected in-suite; the create is
//              real and must never be repeated).
//   K        — STAFF_TEST_READONLY_TOKEN is a `staff.read`-only membership token (optional).
//   H/J      — foreign-scope isolation / last-admin lockout are SERVER-enforced and proven by the API's
//              own suite (`test:staff:persistence`, `test:staff:rls`, `tests/staff/contract-service`),
//              which seeds the foreign scope / second admin that the Admin UI cannot create.
// `expo-crypto` is a device CSPRNG primitive that needs the native Expo runtime global; under jsdom it
// cannot load. Substitute it with the platform Web Crypto (a device-adapter substitution, exactly like
// the auth/storage mocks below) so idempotency keys are still real, unique v4 UUIDs.
vi.mock("expo-crypto", () => ({ randomUUID: () => globalThis.crypto.randomUUID() }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "runtime-user",
    sessionId: "runtime-session",
    getToken: async () => activeToken,
    signOut: async () => {},
  }),
}));
vi.mock("../src/tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

const tenantId = process.env.STAFF_TEST_TENANT_ID ?? "2a000001-0000-4000-8000-000000000001";
let baseUrl: string;
let managerToken: string;
let eligibleEmail: string;
// The token the mocked Clerk adapter hands the SDK. Swapped to the read-only token for scenario K.
let activeToken: string;

/** A tenant-scoped SDK client for out-of-suite fixture verification (never the application under test). */
function fixtureClient() {
  return createCommerceClient({
    baseUrl,
    client: { type: "admin-mobile", version: "0.1.0" },
    getToken: () => managerToken,
  }).withTenant(tenantId);
}

beforeAll(() => {
  const url = process.env.STAFF_TEST_URL;
  if (
    !url ||
    !process.env.STAFF_TEST_TOKEN ||
    !process.env.STAFF_TEST_ELIGIBLE_EMAIL ||
    !/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)
  ) {
    throw new Error(
      "Supply the Phase 2O disposable loopback API (STAFF_TEST_URL), a tenant-wide staff.manage " +
        "session (STAFF_TEST_TOKEN), and an eligible non-member identity email " +
        "(STAFF_TEST_ELIGIBLE_EMAIL); never target production.",
    );
  }
  baseUrl = url;
  managerToken = process.env.STAFF_TEST_TOKEN;
  activeToken = managerToken;
  eligibleEmail = process.env.STAFF_TEST_ELIGIBLE_EMAIL;
  process.env.EXPO_PUBLIC_COMMERCE_API_URL = baseUrl;
  configure({ asyncUtilTimeout: 15000 });
});

afterEach(cleanup);

// A minimal in-memory router so the router-agnostic screens are driven exactly as production wires them
// (list → detail, list → new), without pulling in expo-router.
type View = { name: "list" } | { name: "detail"; membershipId: string } | { name: "new" };

// Dedicated non-member identities seeded by phase_2o_staff.setup.sql so the assignment (F) and lifecycle
// (I+L) scenarios each operate on their OWN member — never the last admin, and independent of ordering.
const IDENTITY_ASSIGN = "2a000030-0000-4000-8000-000000000006"; // Frankie Fixture — scenario F
const IDENTITY_LIFECYCLE = "2a000030-0000-4000-8000-000000000007"; // Ingrid Fixture — scenario I+L

/** Provision a bare membership (no assignment) for an identity via the API, returning its id. */
async function provisionMember(identityId: string): Promise<string> {
  const detail = await fixtureClient().createStaff({
    identityId,
    idempotencyKey: `rt-provision-${identityId}`,
  });
  return detail.membershipId;
}

function StaffApp({ initialView = { name: "list" } as View }: { initialView?: View }) {
  const session = useSession();
  const [view, setView] = useState<View>(initialView);
  if (session.state.phase !== "ready") return <span>{session.state.phase}</span>;
  const { context, tenantId: id } = session.state;
  const adapter = resolveStaffAdapter(session.getTenantClient(id));
  const { canManage } = staffCapabilities(context);

  if (view.name === "new") {
    return (
      <AddStaffFlow
        adapter={adapter}
        onCreated={(staff) => setView({ name: "detail", membershipId: staff.membershipId })}
        onBack={() => setView({ name: "list" })}
      />
    );
  }
  if (view.name === "detail") {
    return (
      <StaffDetailScreen
        adapter={adapter}
        membershipId={view.membershipId}
        canManage={canManage}
        onBack={() => setView({ name: "list" })}
      />
    );
  }
  return (
    <StaffListScreen
      adapter={adapter}
      canManage={canManage}
      onOpenStaff={(membershipId) => setView({ name: "detail", membershipId })}
      onAddStaff={() => setView({ name: "new" })}
      onBack={() => {}}
    />
  );
}

function mount(initialView?: View) {
  render(
    <SessionProvider storage={createMemoryTenantStorage(tenantId)}>
      <StaffApp initialView={initialView} />
    </SessionProvider>,
  );
}

/** The first staff row on the list (there are several real members; open one deterministically). */
async function openFirstStaffRow() {
  const rows = await screen.findAllByTestId(/^staff-row-/);
  fireEvent.click(rows[0]);
}

/** Drive the exact-email identity step and select the first returned match. */
async function findAndSelectEmail(email: string) {
  fireEvent.click(await screen.findByTestId("add-staff"));
  fireEvent.change(await screen.findByTestId("eligible-identity-email"), {
    target: { value: email },
  });
  fireEvent.click(screen.getByTestId("eligible-identity-find"));
  const result = await screen.findByTestId("eligible-identity-result");
  // Each returned identity is a row with testid `eligible-identity-<uuid>`; pick the first one.
  const row = result.querySelector(
    '[data-testid^="eligible-identity-"]:not([data-testid$="-selector"])',
  ) as HTMLElement;
  fireEvent.click(row);
}

/** Click the first real option inside a `${prefix}-selector` container (options are `${prefix}-<uuid>`). */
async function clickFirstOption(prefix: string) {
  const container = await screen.findByTestId(`${prefix}-selector`);
  const option = container.querySelector(
    `[data-testid^="${prefix}-"]:not([data-testid$="-selector"]):not([data-testid$="-summary"])`,
  ) as HTMLElement;
  fireEvent.click(option);
}

// SCENARIO A — LIST / DETAIL: an authorized manager sees the list load and can open a member and read
// their roles/scopes/status.
it("A: lists staff and opens a member showing status and role+scope assignments", async () => {
  mount();
  await openFirstStaffRow();
  await screen.findByTestId("staff-detail-status");
  expect(screen.getByTestId("staff-detail-status").textContent).toBeTruthy();
  // Assignments render (either coupled role+scope rows, or the explicit "no assignments" state).
  expect(
    screen.queryByTestId("staff-assignments") ?? screen.queryByTestId("staff-assignments-empty"),
  ).toBeTruthy();
});

// SCENARIO B — EXACT EMAIL LOOKUP: an active non-member is found by exact email; a partial email and a
// display name are NOT accepted as lookups (blocked at the UX, adapter never called).
it("B: finds an active identity by exact email; rejects partial email and display-name input", async () => {
  mount();
  fireEvent.click(await screen.findByTestId("add-staff"));
  // Partial email → invalid, no lookup.
  fireEvent.change(await screen.findByTestId("eligible-identity-email"), {
    target: { value: eligibleEmail.split("@")[0] },
  });
  fireEvent.click(screen.getByTestId("eligible-identity-find"));
  expect(await screen.findByTestId("eligible-identity-invalid")).toBeTruthy();
  // A display name (has a space, no @) is likewise never a valid lookup.
  fireEvent.change(screen.getByTestId("eligible-identity-email"), {
    target: { value: "Some Person" },
  });
  fireEvent.click(screen.getByTestId("eligible-identity-find"));
  expect(await screen.findByTestId("eligible-identity-invalid")).toBeTruthy();
  // Exact email → the eligible account appears.
  fireEvent.change(screen.getByTestId("eligible-identity-email"), {
    target: { value: eligibleEmail },
  });
  fireEvent.click(screen.getByTestId("eligible-identity-find"));
  expect(await screen.findByTestId("eligible-identity-result")).toBeTruthy();
});

// SCENARIO C — 0 / 1 / N: a no-match email shows the neutral message; the eligible email shows a single
// selectable account; a duplicate-email fixture (when provided) shows every match, none auto-selected.
it("C: shows a neutral 0-result, a selectable 1-result, and (if seeded) an explicit-select N-result", async () => {
  mount();
  fireEvent.click(await screen.findByTestId("add-staff"));
  // 0 matches — a random, unused address.
  fireEvent.change(await screen.findByTestId("eligible-identity-email"), {
    target: { value: `no-such-${Date.now()}@runtime.example` },
  });
  fireEvent.click(screen.getByTestId("eligible-identity-find"));
  expect(await screen.findByTestId("eligible-identity-none")).toBeTruthy();
  // 1 match — the eligible email resolves to exactly one selectable account.
  fireEvent.change(screen.getByTestId("eligible-identity-email"), {
    target: { value: eligibleEmail },
  });
  fireEvent.click(screen.getByTestId("eligible-identity-find"));
  await screen.findByTestId("eligible-identity-result");

  const dupEmail = process.env.STAFF_TEST_DUP_EMAIL;
  if (!dupEmail) return; // N-result requires a seeded duplicate-email pair.
  fireEvent.change(screen.getByTestId("eligible-identity-email"), { target: { value: dupEmail } });
  fireEvent.click(screen.getByTestId("eligible-identity-find"));
  expect(await screen.findByTestId("eligible-identity-multiple")).toBeTruthy();
  const rows = screen
    .getByTestId("eligible-identity-result")
    .querySelectorAll('[data-testid^="eligible-identity-"]');
  expect(rows.length).toBeGreaterThanOrEqual(2);
  // None auto-selected: the "Next — choose a role" affordance is absent until the manager picks one.
  expect(screen.queryByTestId("add-staff-next-role")).toBeNull();
});

// SCENARIO D — ADD STAFF: lookup → select → role → scope → create; exactly one membership results and it
// is visible in list + detail. SCENARIO E — DUPLICATE: adding the same identity again is refused by the
// server (STAFF_CONFLICT), never a second membership.
it("D+E: adds a membership end-to-end, then a duplicate add cannot create a second membership", async () => {
  mount();
  await findAndSelectEmail(eligibleEmail);
  fireEvent.click(await screen.findByTestId("add-staff-next-role"));
  // Role + scope options come from the canonical server catalogs; choose the first of each.
  await clickFirstOption("staff-role");
  fireEvent.click(screen.getByTestId("add-staff-next-scope"));
  await clickFirstOption("staff-scope");
  fireEvent.click(screen.getByTestId("add-staff-next-review"));
  fireEvent.click(await screen.findByTestId("add-staff-submit"));
  // Created → the authoritative detail is shown (create then assign both completed).
  fireEvent.click(await screen.findByTestId("add-staff-view"));
  await screen.findByTestId("staff-detail-status");
  // Exactly one membership now exists for this identity.
  expect(await membershipsByEmail(eligibleEmail)).toHaveLength(1);

  // E — a second add of the SAME identity must not create a duplicate. The server owns this: either the
  // eligible lookup no longer offers an already-linked identity (the UI blocks the duplicate up front),
  // or the identity is still offered and the create is refused distinctly (STAFF_CONFLICT). Accept both.
  cleanup();
  mount();
  fireEvent.click(await screen.findByTestId("add-staff"));
  fireEvent.change(await screen.findByTestId("eligible-identity-email"), {
    target: { value: eligibleEmail },
  });
  fireEvent.click(screen.getByTestId("eligible-identity-find"));
  const stillOffered = await Promise.race([
    screen.findByTestId("eligible-identity-result").then(() => true),
    screen.findByTestId("eligible-identity-none").then(() => false),
  ]);
  if (stillOffered) {
    const result = screen.getByTestId("eligible-identity-result");
    const row = result.querySelector(
      '[data-testid^="eligible-identity-"]:not([data-testid$="-selector"])',
    ) as HTMLElement;
    fireEvent.click(row);
    fireEvent.click(await screen.findByTestId("add-staff-next-role"));
    await clickFirstOption("staff-role");
    fireEvent.click(screen.getByTestId("add-staff-next-scope"));
    await clickFirstOption("staff-scope");
    fireEvent.click(screen.getByTestId("add-staff-next-review"));
    fireEvent.click(await screen.findByTestId("add-staff-submit"));
    // The create is refused (or the whole flow surfaces the conflict) — never a silent second success.
    expect(
      (await screen.findByTestId("add-staff-error").catch(() => null)) ??
        (await screen.findByTestId("add-staff-partial-error").catch(() => null)),
    ).toBeTruthy();
  }
  // Regardless of path, still exactly one membership — no duplicate was created.
  expect(await membershipsByEmail(eligibleEmail)).toHaveLength(1);
});

// SCENARIO F — ROLE / SCOPE: assign a role+scope (from the canonical catalogs) to a member, see it on
// the detail, then unassign it and see it removed. Operates on its OWN dedicated member so it is never
// the last admin and is independent of other scenarios' ordering.
it("F: assigns a catalog role+scope to a member and then unassigns it, re-reading the server each time", async () => {
  const membershipId = await provisionMember(IDENTITY_ASSIGN);
  mount({ name: "detail", membershipId });
  await screen.findByTestId("staff-add-assignment");
  await clickFirstOption("staff-add-role");
  await clickFirstOption("staff-add-scope");
  fireEvent.click(screen.getByTestId("staff-add-assignment-submit"));
  // The detail re-reads; at least one assignment row is present afterwards.
  await waitFor(() => expect(screen.getByTestId("staff-assignments")).toBeTruthy());
  const [unassign] = await screen.findAllByTestId(/^staff-assignment-unassign-/);
  fireEvent.click(unassign);
  fireEvent.click(unassign); // confirm
  // After unassigning the only assignment, the detail re-reads to the empty-assignments state.
  await waitFor(() => expect(screen.getByTestId("staff-assignments-empty")).toBeTruthy());
});

// SCENARIO I — SUSPEND / REACTIVATE, and L — DEACTIVATED HISTORY. Driven against its OWN dedicated
// member so the seeded admin is never suspended (last-admin protection would refuse that anyway) and it
// does not depend on any other scenario's ordering.
it("I+L: suspends and restores a member, then deactivates it while keeping the record readable", async () => {
  const membershipId = await provisionMember(IDENTITY_LIFECYCLE);
  mount({ name: "detail", membershipId });
  await screen.findByTestId("staff-detail-status");
  // Suspend (reversible) → restore.
  fireEvent.click(await screen.findByTestId("staff-lifecycle-suspended"));
  await waitFor(() =>
    expect(screen.getByTestId("staff-detail-status").textContent).toBe("Suspended"),
  );
  fireEvent.click(await screen.findByTestId("staff-lifecycle-active"));
  await waitFor(() => expect(screen.getByTestId("staff-detail-status").textContent).toBe("Active"));
  // Deactivate (confirm twice) → terminal but still fully readable, no delete.
  fireEvent.click(await screen.findByTestId("staff-lifecycle-deactivated"));
  fireEvent.click(screen.getByTestId("staff-lifecycle-deactivated"));
  await waitFor(() =>
    expect(screen.getByTestId("staff-detail-status").textContent).toBe("Deactivated"),
  );
  expect(screen.getByTestId("staff-lifecycle-terminal")).toBeTruthy();
});

// SCENARIO K — READ-ONLY MANAGER: with a `staff.read`-only session, list + detail are available but no
// Add-Staff / mutation controls are offered. Only runs when a read-only token is provisioned.
it("K: a read-only session sees list + detail but no add/mutation controls", async () => {
  const readonlyToken = process.env.STAFF_TEST_READONLY_TOKEN;
  if (!readonlyToken) return; // read-only membership fixture not provisioned.
  activeToken = readonlyToken;
  try {
    mount();
    expect(await screen.findByTestId("staff-read-only-note")).toBeTruthy();
    expect(screen.queryByTestId("add-staff")).toBeNull();
    fireEvent.click(await screen.findByTestId(/^staff-row-/));
    await screen.findByTestId("staff-detail-status");
    expect(screen.queryByTestId("staff-lifecycle-actions")).toBeNull();
    expect(screen.queryByTestId("staff-add-assignment")).toBeNull();
  } finally {
    activeToken = managerToken;
  }
});

// SCENARIO N + G — CANONICAL CATALOGS (the key 0.11.0 regression). The Add-Staff role selector is fed by
// the server catalog, NOT by other members' assignments, so a valid role assigned to NOBODY still
// appears (N, fresh-tenant proof); and a role carrying a permission the manager lacks is filtered out of
// the catalog (G, the UI-visible half of anti-escalation). Navigates only — never creates — so the
// reserved partial-flow identity stays a non-member for scenario M.
it("N+G: an unused catalog role/scope is offered; a non-delegable role is not (catalog, not derivation)", async () => {
  const partialEmail = process.env.STAFF_TEST_PARTIAL_EMAIL;
  if (!partialEmail) return; // needs a guaranteed-eligible identity to reach the role step.
  mount();
  await findAndSelectEmail(partialEmail);
  fireEvent.click(await screen.findByTestId("add-staff-next-role"));
  const roleSelector = await screen.findByTestId("staff-role-selector");
  // An active, permissionless role that no existing staff member holds is still selectable — proof the
  // options are the canonical catalog, not a derivation from existing assignments (which would omit it).
  expect(within(roleSelector).getByText(/Empty Role/)).toBeTruthy();
  // "Privileged" carries `reports.read`, which the manager does not hold; the catalog filters it out.
  expect(within(roleSelector).queryByText(/Privileged/)).toBeNull();
  // The scope catalog likewise offers scopes independent of any member's assignment.
  await clickFirstOption("staff-role");
  fireEvent.click(screen.getByTestId("add-staff-next-scope"));
  expect(await screen.findByTestId("staff-scope-selector")).toBeTruthy();
});

// SCENARIO M — CREATE SUCCEEDS / ASSIGN FAILS. The membership is created for real; the initial
// assignment is made to fail ONCE (injected transport error). The UI must report partial completion,
// leave exactly one membership with ZERO assignments, and let the manager retry ONLY the assignment —
// never re-creating the membership — after which the authoritative detail is correct.
it("M: create succeeds, assignment fails then retries — one membership, no duplicate, no re-create", async () => {
  const partialEmail = process.env.STAFF_TEST_PARTIAL_EMAIL;
  if (!partialEmail) return; // needs a fresh, reserved non-member identity.

  // The next assignment attempt fails once; the membership create is always real.
  failAssignOnce = true;
  render(
    <SessionProvider storage={createMemoryTenantStorage(tenantId)}>
      <StaffAppFlaky />
    </SessionProvider>,
  );
  await findAndSelectEmail(partialEmail);
  fireEvent.click(await screen.findByTestId("add-staff-next-role"));
  await clickFirstOption("staff-role");
  fireEvent.click(screen.getByTestId("add-staff-next-scope"));
  await clickFirstOption("staff-scope");
  fireEvent.click(screen.getByTestId("add-staff-next-review"));
  fireEvent.click(await screen.findByTestId("add-staff-submit"));

  // Partial completion is reported honestly — not "nothing happened", not full success.
  await screen.findByTestId("add-staff-partial-error");
  expect(screen.getByTestId("add-staff-partial-retry")).toBeTruthy();

  // Exactly one membership exists for the identity, and it has ZERO effective permissions (no assignment).
  const afterCreate = await membershipsByEmail(partialEmail);
  expect(afterCreate).toHaveLength(1);
  const created = await fixtureClient().getStaffMember(afterCreate[0].membershipId);
  expect(created.assignments).toHaveLength(0);

  // Retry ONLY the assignment. The create is never repeated; the assignment now succeeds.
  fireEvent.click(screen.getByTestId("add-staff-partial-retry"));
  fireEvent.click(await screen.findByTestId("add-staff-view"));
  await screen.findByTestId("staff-detail-status");

  // Still exactly one membership (no duplicate), now with the assignment applied.
  const afterRetry = await membershipsByEmail(partialEmail);
  expect(afterRetry).toHaveLength(1);
  expect(afterRetry[0].membershipId).toBe(afterCreate[0].membershipId);
  const finalDetail = await fixtureClient().getStaffMember(afterRetry[0].membershipId);
  expect(finalDetail.assignments.length).toBeGreaterThanOrEqual(1);
});

/** Every membership in the tenant whose identity carries the given exact email (follows pagination). */
async function membershipsByEmail(email: string): Promise<Array<{ membershipId: string }>> {
  const client = fixtureClient();
  const found: Array<{ membershipId: string }> = [];
  let cursor: string | undefined;
  for (let page = 0; page < 20; page++) {
    const response = await client.listStaff(cursor ? { cursor } : {});
    for (const row of response.items)
      if ((row.email ?? "").toLowerCase() === email.toLowerCase())
        found.push({ membershipId: row.membershipId });
    if (!response.pageInfo.hasMore || response.pageInfo.nextCursor === null) break;
    cursor = response.pageInfo.nextCursor;
  }
  return found;
}

// A one-shot injected assignment failure for scenario M. The create path is untouched (always real), so
// a real membership results; only `assignStaffRole` is failed the first time to drive partial recovery.
let failAssignOnce = false;
function makeFlakyAssignAdapter(base: StaffAdapter): StaffAdapter {
  return {
    ...base,
    assignRoleScope: (membershipId, input, key) => {
      if (failAssignOnce) {
        failAssignOnce = false;
        return Promise.reject(new ApiNetworkError("injected transport failure (scenario M)"));
      }
      return base.assignRoleScope(membershipId, input, key);
    },
  };
}

function StaffAppFlaky() {
  const session = useSession();
  const [view, setView] = useState<View>({ name: "list" });
  if (session.state.phase !== "ready") return <span>{session.state.phase}</span>;
  const id = session.state.tenantId;
  const base = resolveStaffAdapter(session.getTenantClient(id));
  const adapter = base ? makeFlakyAssignAdapter(base) : null;
  if (view.name === "new") {
    return (
      <AddStaffFlow
        adapter={adapter}
        onCreated={(staff) => setView({ name: "detail", membershipId: staff.membershipId })}
        onBack={() => setView({ name: "list" })}
      />
    );
  }
  if (view.name === "detail") {
    return (
      <StaffDetailScreen
        adapter={adapter}
        membershipId={view.membershipId}
        canManage
        onBack={() => setView({ name: "list" })}
      />
    );
  }
  return (
    <StaffListScreen
      adapter={adapter}
      canManage
      onOpenStaff={(membershipId) => setView({ name: "detail", membershipId })}
      onAddStaff={() => setView({ name: "new" })}
      onBack={() => {}}
    />
  );
}
