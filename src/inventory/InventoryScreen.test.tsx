// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  INVENTORY_LOCATION_A,
  MEMBERSHIP_A,
  SUPPLIER_A,
  TENANT_A,
  VARIANT_A,
  VARIANT_B,
  inventoryItem,
  inventoryList,
  meContext,
  sdkSupplierListResponse,
  sdkSupplierSummary,
  tenant,
} from "../test-support/fixtures";
import { installWebLocks, removeWebLocks } from "../test-support/web-locks";
import { createMemoryTenantStorage } from "../tenant/storage";
import { InventoryScreen } from "./InventoryScreen";

const mocks = vi.hoisted(() => ({
  getMyTenants: vi.fn(),
  getContext: vi.fn(),
  listInventory: vi.fn(),
  listSuppliers: vi.fn(),
  receiveInventory: vi.fn(),
  adjustInventory: vi.fn(),
  transferInventory: vi.fn(),
  randomUUID: vi.fn(),
  withTenant: vi.fn(),
  onReceiveNew: vi.fn(),
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
        listSuppliers: mocks.listSuppliers,
        receiveInventory: mocks.receiveInventory,
        adjustInventory: mocks.adjustInventory,
        transferInventory: mocks.transferInventory,
      };
    },
  }),
}));

// Keep expo-secure-store (native) out of the test module graph; tests always inject storage.
vi.mock("../tenant/secure-storage", () => ({
  createSecureTenantStorage: () => createMemoryTenantStorage(),
}));

// The operations panel pulls in idempotency.ts → native expo-crypto; stub it for the module graph.
vi.mock("expo-crypto", () => ({ randomUUID: mocks.randomUUID }));

import { SessionProvider, useSession } from "../session/SessionProvider";

// Inventory access granted by default; individual tests override as needed.
const READABLE_INVENTORY = {
  inventory: {
    canRead: true,
    tenantWide: true,
    locations: [{ id: INVENTORY_LOCATION_A, name: "Flagship Stockroom", branchId: null }],
    write: {
      canReceive: true,
      canAdjust: true,
      canTransfer: true,
      locations: [
        {
          id: INVENTORY_LOCATION_A,
          name: "Flagship Stockroom",
          canReceive: true,
          canAdjust: true,
          canTransferOrigin: true,
          canTransferDestination: true,
        },
      ],
    },
  },
};

// Renders the real SessionProvider and mounts the screen with the resolved tenant/context once
// bootstrap completes — the same data path the route wrapper uses in production.
function Harness() {
  const { state } = useSession();
  if (state.phase !== "ready") return <span data-testid="phase">{state.phase}</span>;
  return (
    <InventoryScreen
      tenantId={state.tenantId}
      context={state.context}
      onBack={() => {}}
      onReceiveNew={mocks.onReceiveNew}
    />
  );
}

function renderInventory() {
  return render(
    <SessionProvider storage={createMemoryTenantStorage()}>
      <Harness />
    </SessionProvider>,
  );
}

beforeEach(() => {
  installWebLocks();
  vi.clearAllMocks();
  mocks.getMyTenants.mockResolvedValue([tenant(TENANT_A, "Acme", MEMBERSHIP_A)]);
  mocks.getContext.mockResolvedValue(meContext(TENANT_A, READABLE_INVENTORY));
  // Default: no suppliers to offer. Supplier linking is best-effort and never blocks receiving.
  mocks.listSuppliers.mockResolvedValue({
    items: [],
    pageInfo: { nextCursor: null, hasMore: false },
  });
  mocks.randomUUID.mockReset().mockReturnValueOnce("K1").mockReturnValueOnce("K2");
});

afterEach(() => {
  cleanup();
  removeWebLocks();
  // The screen now wires the real web durable store (localStorage); clear it so a journal written by
  // one test never bleeds into the next and blocks its write forms.
  localStorage.clear();
});

describe("InventoryScreen", () => {
  it("shows a loading state while inventory is being fetched", async () => {
    mocks.listInventory.mockReturnValue(new Promise(() => {}));
    renderInventory();
    expect(await screen.findByTestId("inventory-loading")).toBeTruthy();
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
    // SKU and the location id resolved to its human name via /me/context access.
    expect(screen.getByText("LS-001-M · Flagship Stockroom")).toBeTruthy();
    expect(screen.queryByText("Back")).toBeNull();
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
    expect(await screen.findByText(/Nothing in stock yet/)).toBeTruthy();
  });

  it("surfaces a classified network error with a retry", async () => {
    mocks.listInventory.mockRejectedValue(new ApiNetworkError("down"));
    renderInventory();
    expect(await screen.findByText("No connection")).toBeTruthy();
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

    expect(await screen.findByText("Not available for your account")).toBeTruthy();
    expect(screen.queryByText(/Nothing in stock yet/)).toBeNull();
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

    await screen.findByText("No connection");
    // The failure is stable: no uncontrolled retry loop keeps hitting the API.
    expect(mocks.listInventory).toHaveBeenCalledTimes(1);
  });

  it("offers Receive new stock (the POS Add-product flow) as the primary action", async () => {
    mocks.listInventory.mockResolvedValue(
      inventoryList([inventoryItem({ productName: "Linen Shirt" })]),
    );
    renderInventory();
    await screen.findByText("Linen Shirt");
    fireEvent.click(screen.getByTestId("stock-receive-new"));
    expect(mocks.onReceiveNew).toHaveBeenCalledTimes(1);
  });

  it("tapping an item opens its actions: Edit details, Restock, Count and Transfer", async () => {
    mocks.listInventory.mockResolvedValue(
      inventoryList([inventoryItem({ productName: "Linen Shirt" })]),
    );
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, {
        inventory: {
          ...READABLE_INVENTORY.inventory,
          locations: [
            ...READABLE_INVENTORY.inventory.locations,
            { id: "loc-b", name: "Downtown", branchId: null },
          ],
          write: {
            ...READABLE_INVENTORY.inventory.write,
            locations: [
              ...READABLE_INVENTORY.inventory.write.locations,
              {
                id: "loc-b",
                name: "Downtown",
                canReceive: true,
                canAdjust: true,
                canTransferOrigin: true,
                canTransferDestination: true,
              },
            ],
          },
        },
      }),
    );
    renderInventory();
    fireEvent.click(
      await screen.findByTestId(`inventory-row-${INVENTORY_LOCATION_A}:${VARIANT_A}`),
    );
    expect(await screen.findByTestId("stock-sheet")).toBeTruthy();
    expect(await screen.findByTestId("stock-action-restock")).toBeTruthy();
    expect(screen.getByTestId("stock-action-count")).toBeTruthy();
    expect(screen.getByTestId("stock-action-transfer")).toBeTruthy();
    expect(screen.getByTestId("stock-action-edit")).toBeTruthy();
  });

  it("restocks the tapped item at its own location, offering ACTIVE suppliers", async () => {
    mocks.listInventory.mockResolvedValue(
      inventoryList([inventoryItem({ productName: "Linen Shirt", onHand: 4 })]),
    );
    mocks.listSuppliers.mockResolvedValue(
      sdkSupplierListResponse([sdkSupplierSummary({ id: SUPPLIER_A, name: "Nile Textiles" })]),
    );
    mocks.receiveInventory.mockResolvedValue({
      operationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      variantId: VARIANT_A,
      inventoryLocationId: INVENTORY_LOCATION_A,
      observedOnHand: 10,
      version: 3,
      supplierId: SUPPLIER_A,
    });
    renderInventory();
    await waitFor(() =>
      expect(mocks.listSuppliers).toHaveBeenCalledWith(
        expect.objectContaining({ status: "active" }),
      ),
    );
    fireEvent.click(
      await screen.findByTestId(`inventory-row-${INVENTORY_LOCATION_A}:${VARIANT_A}`),
    );
    fireEvent.click(await screen.findByTestId("stock-action-restock"));
    fireEvent.change(screen.getByTestId("restock-quantity"), { target: { value: "6" } });
    fireEvent.click(await screen.findByTestId(`restock-supplier-${SUPPLIER_A}`));
    fireEvent.click(screen.getByTestId("restock-submit"));

    await waitFor(() => expect(mocks.receiveInventory).toHaveBeenCalledTimes(1));
    expect(mocks.receiveInventory.mock.calls[0][0]).toMatchObject({
      variantId: VARIANT_A,
      inventoryLocationId: INVENTORY_LOCATION_A,
      quantity: 6,
      supplierId: SUPPLIER_A,
      idempotencyKey: "K1",
    });
    // Success closes the sheet and re-reads the authoritative list.
    await waitFor(() => expect(screen.queryByTestId("stock-sheet")).toBeNull());
    await waitFor(() => expect(mocks.listInventory).toHaveBeenCalledTimes(2));
  });

  it("still restocks (no supplier field) when supplier loading fails — linking is optional", async () => {
    mocks.listInventory.mockResolvedValue(
      inventoryList([inventoryItem({ productName: "Linen Shirt" })]),
    );
    mocks.listSuppliers.mockRejectedValue(new ApiNetworkError("suppliers down"));
    renderInventory();
    fireEvent.click(
      await screen.findByTestId(`inventory-row-${INVENTORY_LOCATION_A}:${VARIANT_A}`),
    );
    fireEvent.click(await screen.findByTestId("stock-action-restock"));
    expect(screen.queryByTestId(`restock-supplier-${SUPPLIER_A}`)).toBeNull();
    expect(screen.getByTestId("restock-submit")).toBeTruthy();
  });

  it("on a count conflict refreshes, shows a persistent notice, and requires a fresh count", async () => {
    let resolveRefresh!: (value: ReturnType<typeof inventoryList>) => void;
    const refreshedInventory = new Promise<ReturnType<typeof inventoryList>>((resolve) => {
      resolveRefresh = resolve;
    });
    mocks.listInventory
      .mockResolvedValueOnce(inventoryList([inventoryItem({ onHand: 22, version: 2 })]))
      .mockReturnValueOnce(refreshedInventory)
      .mockResolvedValue(inventoryList([inventoryItem({ onHand: 23, version: 6 })]));
    mocks.adjustInventory
      .mockRejectedValueOnce(new ApiHttpError("stale", 409, "CONCURRENT_MODIFICATION", null))
      .mockResolvedValueOnce({
        operationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        changed: true,
        variantId: VARIANT_A,
        inventoryLocationId: INVENTORY_LOCATION_A,
        previousOnHand: 24,
        newOnHand: 23,
        version: 6,
      });
    renderInventory();

    const row = `inventory-row-${INVENTORY_LOCATION_A}:${VARIANT_A}`;
    fireEvent.click(await screen.findByTestId(row));
    fireEvent.click(await screen.findByTestId("stock-action-count"));
    fireEvent.change(screen.getByTestId("count-quantity"), { target: { value: "23" } });
    fireEvent.click(screen.getByTestId("count-submit"));

    expect(await screen.findByTestId("inventory-concurrency-notice")).toBeTruthy();
    expect(screen.queryByTestId("write-retry")).toBeNull();
    await waitFor(() => expect(mocks.listInventory).toHaveBeenCalledTimes(2));
    expect(mocks.adjustInventory).toHaveBeenCalledTimes(1);
    // The stale sheet is gone; the owner must count again against the refreshed quantity.
    expect(screen.queryByTestId("stock-sheet")).toBeNull();
    await act(async () => {
      resolveRefresh(inventoryList([inventoryItem({ onHand: 24, version: 5 })]));
    });
    await waitFor(() =>
      expect(
        screen.getByTestId(`inventory-onhand-${INVENTORY_LOCATION_A}:${VARIANT_A}`).textContent,
      ).toBe("24"),
    );

    fireEvent.click(await screen.findByTestId(row));
    fireEvent.click(await screen.findByTestId("stock-action-count"));
    fireEvent.change(screen.getByTestId("count-quantity"), { target: { value: "23" } });
    fireEvent.click(screen.getByTestId("count-submit"));

    await waitFor(() => expect(mocks.adjustInventory).toHaveBeenCalledTimes(2));
    expect(mocks.adjustInventory.mock.calls[0][0]).toMatchObject({
      expectedVersion: 2,
      idempotencyKey: "K1",
    });
    expect(mocks.adjustInventory.mock.calls[1][0]).toMatchObject({
      expectedVersion: 5,
      idempotencyKey: "K2",
    });
  });

  it("never exposes opening-stock or generic-issue actions on the stock list", async () => {
    mocks.listInventory.mockResolvedValue(
      inventoryList([inventoryItem({ productName: "Linen Shirt" })]),
    );
    renderInventory();
    await screen.findByText("Linen Shirt");
    expect(screen.queryByText(/opening stock|reserve|allocate/i)).toBeNull();
    expect(screen.queryByText(/\bissue\b/i)).toBeNull();
  });

  it("keeps write actions off the surface entirely when inventory cannot be read", async () => {
    mocks.getContext.mockResolvedValue(
      meContext(TENANT_A, { inventory: { canRead: false, tenantWide: false, locations: [] } }),
    );
    renderInventory();
    await screen.findByText(/do not have read access to inventory/);
    expect(screen.queryByTestId("stock-receive-new")).toBeNull();
    expect(screen.queryByTestId("stock-sheet")).toBeNull();
  });
});
