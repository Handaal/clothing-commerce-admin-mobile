// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isPosPinFormat, type PosAccountsClient, PosAccountsScreen } from "./PosAccountsScreen";

// ADR-043 Clerk-free POS bootstrap: the owner creates the first POS admin from Admin Mobile through the existing
// authorized `createPosLogin` — no default PIN, PIN masked, digits/min 4/no max, never filtered or truncated.

afterEach(() => cleanup());

const ROLE = {
  roleId: "e3e3e3e3-e3e3-4e3e-8e3e-e3e3e3e3e3e3",
  roleName: "Owner",
  permissionKeys: ["staff.manage", "pos.sell"],
};
const SCOPE = {
  accessScopeId: "05050505-0505-4050-8050-050505050505",
  scopeName: "Whole business",
  scopeMode: "tenant",
};

function client(overrides: Partial<Record<keyof PosAccountsClient, unknown>> = {}) {
  return {
    listPosLogins: vi.fn().mockResolvedValue({ items: [] }),
    listAssignableStaffRoles: vi.fn().mockResolvedValue({ items: [ROLE] }),
    listAssignableStaffScopes: vi.fn().mockResolvedValue({ items: [SCOPE] }),
    createPosLogin: vi.fn().mockResolvedValue({ membershipId: "m-1" }),
    ...overrides,
  } as unknown as PosAccountsClient & {
    createPosLogin: ReturnType<typeof vi.fn>;
    listPosLogins: ReturnType<typeof vi.fn>;
  };
}

async function openForm() {
  await screen.findByTestId("pos-accounts-empty"); // the list has loaded, so "Add" is enabled
  await waitFor(() => {
    if (!screen.queryByTestId("pos-accounts-form"))
      fireEvent.click(screen.getByTestId("pos-accounts-add"));
    expect(screen.getByTestId("pos-accounts-name")).toBeTruthy();
  });
}

async function fillForm(pin: string) {
  await openForm();
  fireEvent.change(screen.getByTestId("pos-accounts-name"), { target: { value: "Mariam" } });
  fireEvent.change(screen.getByTestId("pos-accounts-username"), { target: { value: "Mariam" } });
  fireEvent.change(screen.getByTestId("pos-accounts-pin"), { target: { value: pin } });
}

describe("PosAccountsScreen", () => {
  it("creates the first POS admin with the exact (long) PIN the owner chose", async () => {
    const api = client();
    render(<PosAccountsScreen client={api} canManage onBack={() => undefined} />);
    const pin = "73519" + "0".repeat(20);
    await fillForm(pin);
    fireEvent.click(screen.getByTestId("pos-accounts-save"));
    await waitFor(() => expect(api.createPosLogin).toHaveBeenCalledTimes(1));
    expect(api.createPosLogin.mock.calls[0][0]).toMatchObject({
      username: "mariam",
      pin,
      displayName: "Mariam",
      posRole: "admin",
      roleId: ROLE.roleId,
      accessScopeId: SCOPE.accessScopeId,
    });
    expect(typeof api.createPosLogin.mock.calls[0][0].idempotencyKey).toBe("string");
    expect(await screen.findByTestId("pos-accounts-notice")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toContain(pin);
  });

  it("masks the PIN field", async () => {
    render(<PosAccountsScreen client={client()} canManage onBack={() => undefined} />);
    await openForm();
    expect((screen.getByTestId("pos-accounts-pin") as HTMLInputElement).type).toBe("password");
  });

  it.each(["123", "12a4", "١٢٣٤", ""])("refuses PIN %j without calling the API", async (pin) => {
    const api = client();
    render(<PosAccountsScreen client={api} canManage onBack={() => undefined} />);
    await fillForm(pin);
    fireEvent.click(screen.getByTestId("pos-accounts-save"));
    expect(await screen.findByTestId("pos-accounts-error")).toBeTruthy();
    expect(api.createPosLogin).not.toHaveBeenCalled();
  });

  it("clears the PIN after a server refusal and never echoes it", async () => {
    const api = client({
      createPosLogin: vi
        .fn()
        .mockRejectedValue(new ApiHttpError("taken", 409, "USERNAME_TAKEN", "req-1", undefined)),
    });
    render(<PosAccountsScreen client={api} canManage onBack={() => undefined} />);
    await fillForm("482193");
    fireEvent.click(screen.getByTestId("pos-accounts-save"));
    expect(await screen.findByTestId("pos-accounts-notice")).toBeTruthy();
    expect((screen.getByTestId("pos-accounts-pin") as HTMLInputElement).value).toBe("");
    expect(document.body.textContent ?? "").not.toContain("482193");
  });

  it("offers no create affordance without staff management", async () => {
    render(<PosAccountsScreen client={client()} canManage={false} onBack={() => undefined} />);
    await screen.findByTestId("pos-accounts-empty");
    expect(screen.queryByTestId("pos-accounts-add")).toBeNull();
  });

  it("PIN rule: digits only, min 4, no maximum", () => {
    expect(isPosPinFormat("1234")).toBe(true);
    expect(isPosPinFormat("9".repeat(200))).toBe(true);
    expect(isPosPinFormat("123")).toBe(false);
    expect(isPosPinFormat("12 34")).toBe(false);
  });
});
