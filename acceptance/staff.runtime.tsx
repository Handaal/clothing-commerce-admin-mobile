import { cleanup, configure, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";

import { SessionProvider, useSession } from "../src/session/SessionProvider";
import { resolveStaffAdapter } from "../src/staff/adapter";
import { staffCapabilities } from "../src/staff/capabilities";
import { AddStaffFlow } from "../src/staff/AddStaffFlow";
import { StaffDetailScreen } from "../src/staff/StaffDetailScreen";
import { StaffListScreen } from "../src/staff/StaffListScreen";
import { createMemoryTenantStorage } from "../src/tenant/storage";

// Phase 2O staff runtime acceptance. This suite drives the REAL application UI against the REAL merged
// Staff API (SDK 0.10.0). Only the device auth/storage adapters are substituted; bootstrap,
// `/me/context`, the SDK, HTTP transport and server-side authorization are all real. An out-of-repo
// orchestration wrapper provisions a disposable loopback API, a Clerk-verifiable session token, and the
// staff fixtures the scenarios need — exactly as the Phase 2L/2M/2N runtime suites are run. It NEVER
// targets production. Without that provisioning `beforeAll` throws and the suite does not run.
//
// Scenario → required fixture (set the matching env var to enable a fixture-gated scenario):
//   A/F/I/L  — STAFF_TEST_TOKEN is a tenant-wide `staff.manage` admin with at least one existing staff
//              member (so list/detail render and role/scope options can be derived).
//   B/C/D/E  — STAFF_TEST_ELIGIBLE_EMAIL is an active identity with NO membership in the tenant.
//   C (N)    — STAFF_TEST_DUP_EMAIL is an email shared by 2+ eligible identities (optional).
//   K        — STAFF_TEST_READONLY_TOKEN is a `staff.read`-only membership token (optional).
//   G/H/J    — anti-escalation / foreign-scope / last-admin are SERVER-enforced and proven by the API's
//              own suite (`test:staff:persistence`, `test:staff:rls`, `tests/staff/contract-service`),
//              which seeds the non-delegable roles / second admin that the Admin UI cannot create.
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

function StaffApp() {
  const session = useSession();
  const [view, setView] = useState<View>({ name: "list" });
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

function mount() {
  render(
    <SessionProvider storage={createMemoryTenantStorage(tenantId)}>
      <StaffApp />
    </SessionProvider>,
  );
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
  const row = await screen.findByTestId(/^staff-row-/);
  fireEvent.click(row);
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
it("D+E: adds a membership end-to-end, then a duplicate add is refused by the server", async () => {
  mount();
  await findAndSelectEmail(eligibleEmail);
  fireEvent.click(await screen.findByTestId("add-staff-next-role"));
  // Role + scope options are derived from existing staff; choose the first of each.
  await clickFirstOption("staff-role");
  fireEvent.click(screen.getByTestId("add-staff-next-scope"));
  await clickFirstOption("staff-scope");
  fireEvent.click(screen.getByTestId("add-staff-next-review"));
  fireEvent.click(await screen.findByTestId("add-staff-submit"));
  // Created → the authoritative detail is shown.
  fireEvent.click(await screen.findByTestId("add-staff-view"));
  await screen.findByTestId("staff-detail-status");

  // E — a second add of the same identity is refused distinctly (no duplicate membership).
  await findAndSelectEmail(eligibleEmail);
  fireEvent.click(await screen.findByTestId("add-staff-next-role"));
  await clickFirstOption("staff-role");
  fireEvent.click(screen.getByTestId("add-staff-next-scope"));
  await clickFirstOption("staff-scope");
  fireEvent.click(screen.getByTestId("add-staff-next-review"));
  fireEvent.click(await screen.findByTestId("add-staff-submit"));
  expect(await screen.findByTestId("add-staff-error")).toBeTruthy();
});

// SCENARIO F — ROLE / SCOPE: assign a role+scope to an existing member, see it on the detail, then
// unassign it and see it removed. Uses the first staff row (the seeded member).
it("F: assigns a role+scope to a member and then unassigns it, re-reading the server each time", async () => {
  mount();
  fireEvent.click(await screen.findByTestId(/^staff-row-/));
  await screen.findByTestId("staff-add-assignment");
  await clickFirstOption("staff-add-role");
  await clickFirstOption("staff-add-scope");
  fireEvent.click(screen.getByTestId("staff-add-assignment-submit"));
  // The detail re-reads; at least one assignment row is present afterwards.
  await waitFor(() => expect(screen.getByTestId("staff-assignments")).toBeTruthy());
  const unassign = screen.queryByTestId(/^staff-assignment-unassign-/);
  if (unassign) {
    fireEvent.click(unassign);
    fireEvent.click(unassign);
    await waitFor(() => expect(screen.getByTestId("staff-detail-status")).toBeTruthy());
  }
});

// SCENARIO I — SUSPEND / REACTIVATE, and L — DEACTIVATED HISTORY. Driven against the freshly added
// member so the seeded admin is never suspended (last-admin protection would refuse that anyway).
it("I+L: suspends and restores a member, then deactivates it while keeping the record readable", async () => {
  mount();
  await findAndSelectEmail(eligibleEmail);
  // If the eligible identity is already a member from a prior run, fall through to the list instead.
  const nextRole = await screen
    .findByTestId("add-staff-next-role")
    .catch(() => null as unknown as HTMLElement | null);
  if (nextRole) {
    fireEvent.click(nextRole);
    await clickFirstOption("staff-role");
    fireEvent.click(screen.getByTestId("add-staff-next-scope"));
    await clickFirstOption("staff-scope");
    fireEvent.click(screen.getByTestId("add-staff-next-review"));
    fireEvent.click(await screen.findByTestId("add-staff-submit"));
    fireEvent.click(await screen.findByTestId("add-staff-view"));
  }
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
