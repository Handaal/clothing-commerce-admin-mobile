// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import {
  IDENTITY_A,
  IDENTITY_B,
  ROLE_MANAGER,
  SCOPE_TENANT,
  eligibleIdentity,
  fakeStaffAdapter,
  staffDetail,
} from "../test-support/fixtures";
import { STAFF_ERROR_CODES } from "./write-errors";
import { AddStaffFlow } from "./AddStaffFlow";

afterEach(() => cleanup());

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

const noop = () => {};

/** Drive the flow from step 1 (identity) through to the review step. */
async function advanceToReview(
  findEligibleIdentitiesByEmail = vi.fn().mockResolvedValue([eligibleIdentity()]),
  overrides: Parameters<typeof fakeStaffAdapter>[0] = {},
) {
  const adapter = fakeStaffAdapter({ findEligibleIdentitiesByEmail, ...overrides });
  render(
    <AddStaffFlow
      adapter={adapter}
      onCreated={noop}
      onBack={noop}
      generateIdempotencyKey={keyFactory("K1")}
    />,
  );
  // Step 1: look up an existing account by exact email, then select it (never raw UUID entry).
  await screen.findByTestId("add-staff-step-identity");
  fireEvent.change(screen.getByTestId("eligible-identity-email"), {
    target: { value: "omar@acme.example" },
  });
  fireEvent.click(screen.getByTestId("eligible-identity-find"));
  fireEvent.click(await screen.findByTestId(`eligible-identity-${IDENTITY_B}`));
  fireEvent.click(screen.getByTestId("add-staff-next-role"));
  // Step 2: choose a role.
  fireEvent.click(await screen.findByTestId(`staff-role-${ROLE_MANAGER}`));
  fireEvent.click(screen.getByTestId("add-staff-next-scope"));
  // Step 3: choose an existing scope.
  fireEvent.click(await screen.findByTestId(`staff-scope-${SCOPE_TENANT}`));
  fireEvent.click(screen.getByTestId("add-staff-next-review"));
  await screen.findByTestId("add-staff-step-review");
  return adapter;
}

describe("AddStaffFlow", () => {
  it("renders the unavailable state (no working form) when there is no adapter", () => {
    render(<AddStaffFlow adapter={null} onCreated={noop} onBack={noop} />);
    expect(screen.getByTestId("staff-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("add-staff-step-identity")).toBeNull();
  });

  it("prompts for an exact email rather than browsing the directory, and never accepts a raw UUID", async () => {
    const findEligibleIdentitiesByEmail = vi.fn().mockResolvedValue([eligibleIdentity()]);
    const adapter = fakeStaffAdapter({ findEligibleIdentitiesByEmail });
    render(<AddStaffFlow adapter={adapter} onCreated={noop} onBack={noop} />);
    await screen.findByTestId("eligible-identity-prompt");
    // No lookup has run yet — the identity directory is never bulk-listed or browsed.
    expect(findEligibleIdentitiesByEmail).not.toHaveBeenCalled();
    // There is no free-text identity-id field and no display-name search in the normal Add-Staff UX.
    expect(screen.queryByTestId("identity-id-input")).toBeNull();
    expect(screen.queryByTestId("eligible-identity-term")).toBeNull();
    expect(screen.queryByTestId("eligible-identity-search")).toBeNull();
  });

  it("blocks an invalid email at the UX level and never calls the adapter", async () => {
    const findEligibleIdentitiesByEmail = vi.fn().mockResolvedValue([eligibleIdentity()]);
    const adapter = fakeStaffAdapter({ findEligibleIdentitiesByEmail });
    render(<AddStaffFlow adapter={adapter} onCreated={noop} onBack={noop} />);
    fireEvent.change(await screen.findByTestId("eligible-identity-email"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByTestId("eligible-identity-find"));
    expect(await screen.findByTestId("eligible-identity-invalid")).toBeTruthy();
    expect(findEligibleIdentitiesByEmail).not.toHaveBeenCalled();
  });

  it("looks up the exact (trimmed, lowercased) email and shows one neutral no-result message for 0 matches", async () => {
    const findEligibleIdentitiesByEmail = vi.fn().mockResolvedValue([]);
    const adapter = fakeStaffAdapter({ findEligibleIdentitiesByEmail });
    render(<AddStaffFlow adapter={adapter} onCreated={noop} onBack={noop} />);
    fireEvent.change(await screen.findByTestId("eligible-identity-email"), {
      target: { value: "  Missing@Acme.Example " },
    });
    fireEvent.click(screen.getByTestId("eligible-identity-find"));
    expect(await screen.findByText("No eligible account was found for this email.")).toBeTruthy();
    // Adapter is called with the exact, normalized email — no wildcard, no display name.
    expect(findEligibleIdentitiesByEmail).toHaveBeenCalledWith("missing@acme.example");
  });

  it("finds a single account by email, requires an explicit select, then proceeds to the role step", async () => {
    const findEligibleIdentitiesByEmail = vi.fn().mockResolvedValue([eligibleIdentity()]);
    const adapter = fakeStaffAdapter({ findEligibleIdentitiesByEmail });
    render(<AddStaffFlow adapter={adapter} onCreated={noop} onBack={noop} />);
    fireEvent.change(await screen.findByTestId("eligible-identity-email"), {
      target: { value: "omar@acme.example" },
    });
    fireEvent.click(screen.getByTestId("eligible-identity-find"));
    // Even the single result is shown for confirmation — the role step is unavailable until selected.
    await screen.findByTestId(`eligible-identity-${IDENTITY_B}`);
    expect(screen.queryByTestId("add-staff-next-role")).toBeNull();
    fireEvent.click(screen.getByTestId(`eligible-identity-${IDENTITY_B}`));
    fireEvent.click(await screen.findByTestId("add-staff-next-role"));
    expect(await screen.findByTestId("add-staff-step-role")).toBeTruthy();
  });

  it("shows every exact-email match for 2+ results, auto-selects none, and blocks the role step until one is chosen", async () => {
    // Two accounts share the SAME exact email (primary_email is not globally unique).
    const first = eligibleIdentity({ identityId: IDENTITY_B, displayName: "Omar Fathy" });
    const second = eligibleIdentity({ identityId: IDENTITY_A, displayName: "Omar F. (personal)" });
    const findEligibleIdentitiesByEmail = vi.fn().mockResolvedValue([first, second]);
    const adapter = fakeStaffAdapter({ findEligibleIdentitiesByEmail });
    render(<AddStaffFlow adapter={adapter} onCreated={noop} onBack={noop} />);
    fireEvent.change(await screen.findByTestId("eligible-identity-email"), {
      target: { value: "omar@acme.example" },
    });
    fireEvent.click(screen.getByTestId("eligible-identity-find"));
    // BOTH exact-email matches are shown; the operator is told to choose explicitly.
    await screen.findByTestId(`eligible-identity-${IDENTITY_B}`);
    expect(screen.getByTestId(`eligible-identity-${IDENTITY_A}`)).toBeTruthy();
    expect(screen.getByTestId("eligible-identity-multiple")).toBeTruthy();
    // NONE is auto-selected — no "Selected" badge and no way forward yet.
    expect(screen.queryByTestId(`eligible-identity-selected-${IDENTITY_B}`)).toBeNull();
    expect(screen.queryByTestId(`eligible-identity-selected-${IDENTITY_A}`)).toBeNull();
    expect(screen.queryByTestId("add-staff-next-role")).toBeNull();
    // The manager explicitly chooses the second one; it becomes selected and proceeds correctly.
    fireEvent.click(screen.getByTestId(`eligible-identity-${IDENTITY_A}`));
    expect(await screen.findByTestId(`eligible-identity-selected-${IDENTITY_A}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId("add-staff-next-role"));
    expect(await screen.findByTestId("add-staff-step-role")).toBeTruthy();
  });

  it("walks all four steps and creates the membership via the adapter (real response only)", async () => {
    const addStaff = vi.fn().mockResolvedValue(
      staffDetail({
        identity: {
          identityId: IDENTITY_B,
          displayName: "Omar Fathy",
          primaryEmail: "omar@acme.example",
          identityStatus: "active",
        },
      }),
    );
    const findEligibleIdentitiesByEmail = vi.fn().mockResolvedValue([eligibleIdentity()]);
    const adapter = fakeStaffAdapter({ findEligibleIdentitiesByEmail, addStaff });
    const onCreated = vi.fn();
    render(
      <AddStaffFlow
        adapter={adapter}
        onCreated={onCreated}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    fireEvent.change(await screen.findByTestId("eligible-identity-email"), {
      target: { value: "omar@acme.example" },
    });
    fireEvent.click(screen.getByTestId("eligible-identity-find"));
    fireEvent.click(await screen.findByTestId(`eligible-identity-${IDENTITY_B}`));
    fireEvent.click(screen.getByTestId("add-staff-next-role"));
    fireEvent.click(await screen.findByTestId(`staff-role-${ROLE_MANAGER}`));
    fireEvent.click(screen.getByTestId("add-staff-next-scope"));
    fireEvent.click(await screen.findByTestId(`staff-scope-${SCOPE_TENANT}`));
    fireEvent.click(screen.getByTestId("add-staff-next-review"));
    fireEvent.click(await screen.findByTestId("add-staff-submit"));

    await waitFor(() =>
      expect(addStaff).toHaveBeenCalledWith(
        { identityId: IDENTITY_B, roleId: ROLE_MANAGER, scopeId: SCOPE_TENANT },
        "K1",
      ),
    );
    // Only the adapter's real response drives success — no fake success path.
    fireEvent.click(await screen.findByTestId("add-staff-view"));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("surfaces a membership-conflict rejection distinctly (never a silent success)", async () => {
    const addStaff = vi
      .fn()
      .mockRejectedValue(new ApiHttpError("dup", 409, STAFF_ERROR_CODES.staffConflict, null));
    await advanceToReview(vi.fn().mockResolvedValue([eligibleIdentity()]), { addStaff });
    fireEvent.click(await screen.findByTestId("add-staff-submit"));
    expect(await screen.findByText("Change conflicts")).toBeTruthy();
    expect(addStaff).toHaveBeenCalledTimes(1);
  });
});
