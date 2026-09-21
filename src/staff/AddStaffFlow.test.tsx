// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import {
  IDENTITY_B,
  ROLE_MANAGER,
  SCOPE_TENANT,
  eligibleIdentity,
  fakeStaffAdapter,
  staffDetail,
} from "../test-support/fixtures";
import { PROVISIONAL_STAFF_ERROR_CODES } from "./write-errors";
import { AddStaffFlow } from "./AddStaffFlow";

afterEach(() => cleanup());

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

function page<T>(items: T[]) {
  return { items, pageInfo: { nextCursor: null, hasMore: false } };
}

const noop = () => {};

/** Drive the flow from step 1 (identity) through to the review step. */
async function advanceToReview(
  searchEligibleIdentities = vi.fn().mockResolvedValue(page([eligibleIdentity()])),
  overrides: Parameters<typeof fakeStaffAdapter>[0] = {},
) {
  const adapter = fakeStaffAdapter({ searchEligibleIdentities, ...overrides });
  render(
    <AddStaffFlow
      adapter={adapter}
      onCreated={noop}
      onBack={noop}
      generateIdempotencyKey={keyFactory("K1")}
    />,
  );
  // Step 1: search then select an existing identity (never raw UUID entry).
  await screen.findByTestId("add-staff-step-identity");
  fireEvent.change(screen.getByTestId("eligible-identity-term"), { target: { value: "omar" } });
  fireEvent.click(screen.getByTestId("eligible-identity-search"));
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

  it("prompts to search rather than dumping every identity, and never accepts a raw UUID", async () => {
    const searchEligibleIdentities = vi.fn().mockResolvedValue(page([eligibleIdentity()]));
    const adapter = fakeStaffAdapter({ searchEligibleIdentities });
    render(<AddStaffFlow adapter={adapter} onCreated={noop} onBack={noop} />);
    await screen.findByTestId("eligible-identity-prompt");
    // No search has run yet — the identity directory is not bulk-listed.
    expect(searchEligibleIdentities).not.toHaveBeenCalled();
    // There is no free-text identity-id field in the normal Add-Staff UX.
    expect(screen.queryByTestId("identity-id-input")).toBeNull();
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
    const searchEligibleIdentities = vi.fn().mockResolvedValue(page([eligibleIdentity()]));
    const adapter = fakeStaffAdapter({ searchEligibleIdentities, addStaff });
    const onCreated = vi.fn();
    render(
      <AddStaffFlow
        adapter={adapter}
        onCreated={onCreated}
        onBack={noop}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    fireEvent.change(await screen.findByTestId("eligible-identity-term"), {
      target: { value: "omar" },
    });
    fireEvent.click(screen.getByTestId("eligible-identity-search"));
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

  it("surfaces a membership-already-exists rejection distinctly (never a silent success)", async () => {
    const addStaff = vi
      .fn()
      .mockRejectedValue(
        new ApiHttpError("dup", 409, PROVISIONAL_STAFF_ERROR_CODES.membershipExists, null),
      );
    await advanceToReview(vi.fn().mockResolvedValue(page([eligibleIdentity()])), { addStaff });
    fireEvent.click(await screen.findByTestId("add-staff-submit"));
    expect(await screen.findByText("Already a member")).toBeTruthy();
    expect(addStaff).toHaveBeenCalledTimes(1);
  });
});
