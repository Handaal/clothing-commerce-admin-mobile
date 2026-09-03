// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INVENTORY_LOCATION_A,
  MEMBERSHIP_A,
  TENANT_A,
  VARIANT_A,
  VARIANT_B,
  inventoryItem,
  inventoryList,
  meContext,
  tenant,
} from "../test-support/fixtures";
import { createMemoryTenantStorage } from "../tenant/storage";
import { InventoryScreen } from "./InventoryScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listInventory: vi.fn(),
  withTenant: vi.fn(),
  signOut: vi.fn(async () => {}),
}));

// Reproduce the real Clerk shape (new getToken identity per render); always signed in for these tests.
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: true,
    userId: "user_1",
    sessionId: "sess_1",
    getToken: () => Promise.resolve("test-token"),
    signOut: mocks.signOut,
  }),
}));

// The real SDK boundary is preserved: the screen reaches the SDK only through
// SessionProvider → getTenantClient(tenantId) → withTenant(tenantId).listInventory().
vi.mock("../commerce/client", () => ({
  createConfiguredCommerceClient: () => ({
    getMyTenants: mocks.getMyTenants,
    withTenant: (tenantId: string) => {
      mocks.withTenant(tenantId);
      return {
        tenantId,
        getContext: mocks.getContext,
        listInventory: mocks.listInventory,
      };
    },
  }),
}));

// Keep expo-secure-store (native) out of the test module graph; tests always inject storage.
vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

import { SessionProvider, useSession } from "../session/SessionProvider";

// Inventory access granted by default; individual tests override as needed.
const READABLE_INVENTORY = {
  inventory: {
    canRead: true,
    tenantWide: true,
    locations: [{ id: INVENTORY_LOCATION_A, name: "Flagship Stockroom", branchId: null }],
  },
};

// Renders the real SessionProvider and mounts the screen with the resolved tenant/context once
// bootstrap completes — the same data path the route wrapper uses in production.
function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return <InventoryScreen tenantId={state.tenantId} context={state.context} onBack={() => {}} />;
}

function renderInventory() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness />
    </SessionProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A, READABLE_INVENTORY));
});

afterEach(() => cleanup());

describe("InventoryScreen", () => {
  it("shows a loading state while inventory is being fetched", async () => {
    mocks.listInventory.mockReturnValue(new Promise(() => {}));
    renderInventory();
    expect(await screen.findByText("Loading inventory…")).toBeTruthy();
  });

  it("renders a populated list scoped to the tenant, with quantity, SKU and resolved location", async () => {
    mocks.listInventory.mockResolvedValue(
      inventoryList([
        inventoryItem({
          variantId: VARIANT_A,
          productName: "Linen Shirt",
          sku: "LS-001-M",
          onHand: 22,
        }),
      ]),
    );
    renderInventory();

    expect(await screen.findByText("Linen Shirt")).toBeTruthy();
    expect(
      screen.getByTestId(`inventory-onhand-${INVENTORY_LOCATION_A}:${VARIANT_A}`).textContent,
    ).toBe("22");
    expect(screen.getByText("LS-001-M")).toBeTruthy();
    // Location id resolved to its human name via /me/context access.
    expect(screen.getByText("Flagship Stockroom")).toBeTruthy();
    // The call went through the tenant-scoped client for the resolved tenant, exactly once.
    expect(mocks.withTenant).toHaveBeenCalledWith(TENANT_A);
    expect(mocks.listInventory).toHaveBeenCalledTimes(1);
  });

  it("renders a zero balance honestly as 0 (never hidden)", async () => {
    mocks.listInventory.mockResolvedValue(
      inventoryList([inventoryItem({ variantId: VARIANT_A, onHand: 0 })]),
    );
    renderInventory();

    await screen.findByText("Linen Shirt");
    expect(
      screen.getByTestId(`inventory-onhand-${INVENTORY_LOCATION_A}:${VARIANT_A}`).textContent,
    ).toBe("0");
  });

  it("follows the cursor and presents the full inventory, not just page one", async () => {
    mocks.listInventory
      .mockResolvedValueOnce(
        inventoryList(
          [inventoryItem({ variantId: VARIANT_A, productName: "Linen Shirt", onHand: 22 })],
          {
            hasMore: true,
            nextCursor: "cursor-1",
          },
        ),
      )
      .mockResolvedValueOnce(
        inventoryList(
          [inventoryItem({ variantId: VARIANT_B, productName: "Canvas Tote", onHand: 12 })],
          {
            hasMore: false,
            nextCursor: null,
          },
        ),
      );
    renderInventory();

    // Both pages are rendered.
    expect(await screen.findByText("Linen Shirt")).toBeTruthy();
    expect(await screen.findByText("Canvas Tote")).toBeTruthy();
    expect(mocks.listInventory).toHaveBeenCalledTimes(2);
    expect(mocks.listInventory.mock.calls[1][0]).toEqual({ cursor: "cursor-1" });
  });

  it("shows an explicit empty state (not an error) when there is no inventory", async () => {
    mocks.listInventory.mockResolvedValue(inventoryList([]));
    renderInventory();
    expect(await screen.findByText(/No inventory yet/)).toBeTruthy();
  });

  it("surfaces a classified network error with a retry", async () => {
    mocks.listInventory.mockRejectedValue(new ApiNetworkError("down"));
    renderInventory();
    expect(await screen.findByText("Cannot reach the Commerce API")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("retries the fetch when the user taps Try again", async () => {
    mocks.listInventory
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(inventoryList([inventoryItem({ productName: "Linen Shirt" })]));
    renderInventory();

    fireEvent.click(await screen.findByText("Try again"));

    expect(await screen.findByText("Linen Shirt")).toBeTruthy();
    expect(mocks.listInventory).toHaveBeenCalledTimes(2);
  });

  it("does NOT turn a 403 into an empty list — it shows access denied", async () => {
    mocks.listInventory.mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    renderInventory();

    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByText(/No inventory yet/)).toBeNull();
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("shows a no-access message and never calls the API without inventory.read", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, { inventory: { canRead: false, tenantWide: false, locations: [] } }),
    );
    renderInventory();

    expect(await screen.findByText(/do not have read access to inventory/)).toBeTruthy();
    expect(mocks.listInventory).not.toHaveBeenCalled();
  });

  it("does not refetch on an ordinary rerender", async () => {
    mocks.listInventory.mockResolvedValue(
      inventoryList([inventoryItem({ productName: "Linen Shirt" })]),
    );
    // Same provider instance (stable storage) so the tree re-renders without remounting/re-bootstrapping.
    const tree = (
      <SessionProvider storage={createMemoryTenantStorage()}>
        <Harness />
      </SessionProvider>
    );
    const { rerender } = render(tree);

    await screen.findByText("Linen Shirt");
    expect(mocks.listInventory).toHaveBeenCalledTimes(1);

    // An ordinary top-down rerender must not retrigger the bounded fetch.
    rerender(tree);
    await screen.findByText("Linen Shirt");
    expect(mocks.listInventory).toHaveBeenCalledTimes(1);
  });

  it("does not auto-retry after a failure settles", async () => {
    mocks.listInventory.mockRejectedValue(new ApiNetworkError("down"));
    renderInventory();

    await screen.findByText("Cannot reach the Commerce API");
    // The failure is stable: no uncontrolled retry loop keeps hitting the API.
    expect(mocks.listInventory).toHaveBeenCalledTimes(1);
  });

  it("exposes no inventory-mutation actions on the read surface", async () => {
    mocks.listInventory.mockResolvedValue(
      inventoryList([inventoryItem({ productName: "Linen Shirt" })]),
    );
    renderInventory();
    await screen.findByText("Linen Shirt");
    expect(
      screen.queryByText(/adjust|transfer|receive|reserve|allocate|edit|delete|save|count|issue/i),
    ).toBeNull();
  });
});
