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
  setCategorySizeGuide: vi.fn(),
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

  it("saves a size guide typed as text, from a template", async () => {
    mocks.setCategorySizeGuide.mockResolvedValue({ categoryId: MEN, hasSizeGuide: true });
    renderScreen();
    fireEvent.click(await screen.findByTestId("cat-edit-men"));
    fireEvent.click(screen.getByTestId("sg-template-tops-men"));
    fireEvent.change(screen.getByTestId("sg-rows-men"), {
      target: { value: "S: 96-100, 70, 44\nM: 100-104, 72, 46" },
    });
    expect(screen.getByTestId("sg-preview-men")).toBeTruthy();
    fireEvent.click(screen.getByTestId("sg-save-men"));
    await waitFor(() =>
      expect(mocks.setCategorySizeGuide).toHaveBeenCalledWith({
        categoryId: MEN,
        sizeGuide: {
          title: null,
          unit: "cm",
          columns: ["Chest", "Length", "Shoulder"],
          rows: [
            { size: "S", values: ["96-100", "70", "44"] },
            { size: "M", values: ["100-104", "72", "46"] },
          ],
          note: null,
        },
        idempotencyKey: "key-1",
      }),
    );
  });

  it("explains a size line with the wrong number of values instead of saving", async () => {
    renderScreen();
    fireEvent.click(await screen.findByTestId("cat-edit-men"));
    fireEvent.change(screen.getByTestId("sg-columns-men"), { target: { value: "Chest, Length" } });
    fireEvent.change(screen.getByTestId("sg-rows-men"), { target: { value: "M: 100" } });
    fireEvent.click(screen.getByTestId("sg-save-men"));
    expect(await screen.findByText("Line 1 (M): 1 values for 2 measurements.")).toBeTruthy();
    expect(mocks.setCategorySizeGuide).not.toHaveBeenCalled();
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
