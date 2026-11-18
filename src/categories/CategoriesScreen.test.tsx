// @vitest-environment jsdom
import { ApiHttpError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MEMBERSHIP_A, TENANT_A, meContext, tenant } from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { CategoriesScreen } from "./CategoriesScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  setCategoryStatus: vi.fn(),
}));

vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_1",
    sessionId: "sess_1",
    getToken: () => Promise.resolve("test-token"),
    signOut: vi.fn(),
  }),
}));
vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => ({ tenantId, ...mocks }),
  }),
}));
vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "mock-uuid" }));

import { SessionProvider, useSession } from "../session/SessionProvider";

const MEN = "c1000000-0000-4000-8000-000000000001";
let keySeq = 0;

function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <CategoriesScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => {}}
      generateIdempotencyKey={() => `key-${++keySeq}`}
    />
  );
}

function renderScreen() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  keySeq = 0;
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A));
  mocks.listCategories.mockResolvedValue({
    categories: [
      {
        id: MEN,
        parentId: null,
        name: "Men",
        slug: "men",
        description: null,
        position: 0,
        status: "active",
        productCount: 4,
      },
    ],
  });
});

afterEach(() => cleanup());

describe("CategoriesScreen", () => {
  it("lists categories and creates a subcategory with a slug from its name", async () => {
    mocks.createCategory.mockResolvedValue({ categoryId: "new", status: "active" });
    renderScreen();
    expect(await screen.findByTestId("cat-row-men")).toBeTruthy();
    fireEvent.change(screen.getByTestId("cat-new-name"), { target: { value: "Men T-Shirts" } });
    fireEvent.click(screen.getByTestId(`cat-new-parent-${MEN}`));
    fireEvent.click(screen.getByTestId("cat-new-submit"));
    await waitFor(() =>
      expect(mocks.createCategory).toHaveBeenCalledWith({
        name: "Men T-Shirts",
        slug: "men-t-shirts",
        parentId: MEN,
        idempotencyKey: "key-1",
      }),
    );
  });

  it("explains a cycle rejection from the server", async () => {
    mocks.updateCategory.mockRejectedValueOnce(
      new ApiHttpError("cycle", 409, "CATEGORY_CYCLE", "req-1"),
    );
    renderScreen();
    fireEvent.click(await screen.findByTestId("cat-edit-men"));
    fireEvent.click(screen.getByTestId("cat-save-men"));
    expect(await screen.findByText("Can't place it there")).toBeTruthy();
  });
});
