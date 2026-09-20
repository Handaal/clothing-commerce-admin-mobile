// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// idempotency.ts imports the native expo-crypto module; stub it so the test graph loads. The secure
// default is never used here — every test injects a deterministic key factory.
vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import {
  INVENTORY_LOCATION_A,
  INVENTORY_LOCATION_B,
  VARIANT_A,
  adjustResponse,
  inventoryItem,
  receiveResponse,
  transferResponse,
} from "../test-support/fixtures";
import { InventoryOperations, type InventoryWriteAccess } from "./InventoryOperations";
import { rowKey } from "./operations";

const LOCATIONS = [
  { id: INVENTORY_LOCATION_A, name: "Flagship Stockroom", branchId: null },
  { id: INVENTORY_LOCATION_B, name: "Overflow Stockroom", branchId: null },
];

const WRITE_LOCATIONS: InventoryWriteAccess["locations"] = LOCATIONS.map(({ id, name }) => ({
  id,
  name,
  canReceive: true,
  canAdjust: true,
  canTransferOrigin: true,
  canTransferDestination: true,
}));

const WRITE_ACCESS: InventoryWriteAccess = {
  canReceive: true,
  canAdjust: true,
  canTransfer: true,
  locations: WRITE_LOCATIONS,
};

const ITEMS = [
  inventoryItem({
    variantId: VARIANT_A,
    inventoryLocationId: INVENTORY_LOCATION_A,
    productName: "Linen Shirt",
    sku: "LS-001-M",
    onHand: 22,
    version: 2,
  }),
];

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

interface HarnessProps {
  client: Parameters<typeof InventoryOperations>[0]["client"];
  generateKey: () => string;
  onRefresh: () => void;
  items?: typeof ITEMS;
  write?: InventoryWriteAccess;
  onConcurrencyConflict?: () => void;
}

function Harness({
  client,
  generateKey,
  onRefresh,
  items = ITEMS,
  write = WRITE_ACCESS,
  onConcurrencyConflict = onRefresh,
}: HarnessProps) {
  const [conflictCount, setConflictCount] = useState(0);
  return (
    <>
      {conflictCount > 0 ? (
        <span data-testid="inventory-concurrency-notice">
          Inventory changed. Review the refreshed row and enter the count again.
        </span>
      ) : null}
      <InventoryOperations
        key={conflictCount}
        client={client}
        locations={LOCATIONS}
        write={write}
        items={items}
        onRefresh={onRefresh}
        onConcurrencyConflict={() => {
          setConflictCount((count) => count + 1);
          onConcurrencyConflict();
        }}
        generateIdempotencyKey={generateKey}
      />
    </>
  );
}

function typeInto(testID: string, value: string) {
  fireEvent.change(screen.getByTestId(testID), { target: { value } });
}

afterEach(() => cleanup());

describe("server-derived write capability UX", () => {
  const client = {
    receiveInventory: vi.fn(),
    adjustInventory: vi.fn(),
    transferInventory: vi.fn(),
  };

  it("hides every action when its top-level capability is false", () => {
    render(
      <Harness
        client={client}
        generateKey={keyFactory("K1")}
        onRefresh={vi.fn()}
        write={{ ...WRITE_ACCESS, canReceive: false, canAdjust: false, canTransfer: false }}
      />,
    );

    expect(screen.queryByTestId("open-receive")).toBeNull();
    expect(screen.queryByTestId("open-adjust")).toBeNull();
    expect(screen.queryByTestId("open-transfer")).toBeNull();
  });

  it("offers Receive only at locations with canReceive", () => {
    const write: InventoryWriteAccess = {
      ...WRITE_ACCESS,
      locations: WRITE_LOCATIONS.map((location) => ({
        ...location,
        canReceive: location.id === INVENTORY_LOCATION_A,
      })),
    };
    render(
      <Harness client={client} generateKey={keyFactory("K1")} onRefresh={vi.fn()} write={write} />,
    );

    fireEvent.click(screen.getByTestId("open-receive"));
    expect(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`)).toBeTruthy();
    expect(screen.queryByTestId(`receive-location-${INVENTORY_LOCATION_B}`)).toBeNull();
  });

  it("filters Transfer origins and destinations independently", () => {
    const write: InventoryWriteAccess = {
      ...WRITE_ACCESS,
      locations: WRITE_LOCATIONS.map((location) => ({
        ...location,
        canTransferOrigin: location.id === INVENTORY_LOCATION_A,
        canTransferDestination: location.id === INVENTORY_LOCATION_B,
      })),
    };
    render(
      <Harness client={client} generateKey={keyFactory("K1")} onRefresh={vi.fn()} write={write} />,
    );

    fireEvent.click(screen.getByTestId("open-transfer"));
    expect(screen.getByTestId(`transfer-source-${INVENTORY_LOCATION_A}`)).toBeTruthy();
    expect(screen.queryByTestId(`transfer-source-${INVENTORY_LOCATION_B}`)).toBeNull();
    expect(screen.getByTestId(`transfer-destination-${INVENTORY_LOCATION_B}`)).toBeTruthy();
    expect(screen.queryByTestId(`transfer-destination-${INVENTORY_LOCATION_A}`)).toBeNull();
  });
});

describe("Receive stock", () => {
  let onRefresh = vi.fn();
  beforeEach(() => {
    onRefresh = vi.fn();
  });

  it("sends the tenant-scoped SDK request with the fields and idempotency key, then refreshes", async () => {
    const receiveInventory = vi
      .fn()
      .mockResolvedValue(receiveResponse({ observedOnHand: 27, observedVersion: 2 }));
    render(
      <Harness
        client={{ receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() }}
        generateKey={keyFactory("K1")}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    typeInto("receive-quantity", "5");
    fireEvent.click(screen.getByTestId("receive-submit"));

    expect(await screen.findByTestId("receive-success")).toBeTruthy();
    expect(receiveInventory).toHaveBeenCalledTimes(1);
    expect(receiveInventory).toHaveBeenCalledWith({
      variantId: VARIANT_A,
      inventoryLocationId: INVENTORY_LOCATION_A,
      quantity: 5,
      idempotencyKey: "K1",
    });
    // Authoritative on-hand from the server response is shown; the balance is never computed locally.
    expect(screen.getByTestId("receive-observed-onhand").textContent).toBe("27");
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
  });

  it("blocks a duplicate submit while the request is in flight", () => {
    const receiveInventory = vi.fn().mockReturnValue(new Promise(() => {}));
    render(
      <Harness
        client={{ receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() }}
        generateKey={keyFactory("K1", "K2")}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    typeInto("receive-quantity", "5");
    fireEvent.click(screen.getByTestId("receive-submit"));
    fireEvent.click(screen.getByTestId("receive-submit"));

    expect(receiveInventory).toHaveBeenCalledTimes(1);
  });

  it("shows an explicit access-denied state on 403 with no retry affordance", async () => {
    const receiveInventory = vi
      .fn()
      .mockRejectedValue(new ApiHttpError("no", 403, "FORBIDDEN", null));
    render(
      <Harness
        client={{ receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() }}
        generateKey={keyFactory("K1")}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    typeInto("receive-quantity", "5");
    fireEvent.click(screen.getByTestId("receive-submit"));

    expect(await screen.findByText("Access denied")).toBeTruthy();
    expect(screen.queryByTestId("write-retry")).toBeNull();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("reuses the SAME idempotency key when retrying an ambiguous network failure", async () => {
    const receiveInventory = vi
      .fn()
      .mockRejectedValueOnce(new ApiNetworkError("down"))
      .mockResolvedValueOnce(receiveResponse());
    render(
      <Harness
        client={{ receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() }}
        generateKey={keyFactory("K1", "K2")}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    typeInto("receive-quantity", "5");
    fireEvent.click(screen.getByTestId("receive-submit"));

    fireEvent.click(await screen.findByTestId("write-retry"));
    expect(await screen.findByTestId("receive-success")).toBeTruthy();

    expect(receiveInventory).toHaveBeenCalledTimes(2);
    expect(receiveInventory.mock.calls[0][0].idempotencyKey).toBe("K1");
    expect(receiveInventory.mock.calls[1][0].idempotencyKey).toBe("K1"); // reused, not regenerated
  });
});

describe("Adjust (reconcile)", () => {
  it("adjusts immediately from a fresh inventory row using its authoritative version", async () => {
    const onRefresh = vi.fn();
    const adjustInventory = vi
      .fn()
      .mockResolvedValue(adjustResponse({ newOnHand: 25, version: 3 }));
    render(
      <Harness
        client={{ receiveInventory: vi.fn(), adjustInventory, transferInventory: vi.fn() }}
        generateKey={keyFactory("K1")}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTestId("open-adjust"));
    fireEvent.click(screen.getByTestId(`adjust-row-${rowKey(INVENTORY_LOCATION_A, VARIANT_A)}`));
    typeInto("adjust-counted", "25");
    fireEvent.click(screen.getByTestId("adjust-submit"));

    expect(await screen.findByTestId("adjust-success")).toBeTruthy();
    expect(adjustInventory).toHaveBeenCalledWith({
      variantId: VARIANT_A,
      inventoryLocationId: INVENTORY_LOCATION_A,
      countedQuantity: 25,
      expectedVersion: 2,
      idempotencyKey: "K1",
    });
    expect(screen.getByTestId("adjust-new-onhand").textContent).toBe("25");
    expect(onRefresh).toHaveBeenCalled();
  });

  it("offers only rows from locations where adjustment is permitted", () => {
    const write: InventoryWriteAccess = {
      ...WRITE_ACCESS,
      locations: WRITE_LOCATIONS.map((location) => ({
        ...location,
        canAdjust: location.id === INVENTORY_LOCATION_A,
      })),
    };
    const items = [
      ...ITEMS,
      inventoryItem({
        inventoryLocationId: INVENTORY_LOCATION_B,
        variantId: VARIANT_A,
        onHand: 8,
        version: 4,
      }),
    ];
    render(
      <Harness
        client={{ receiveInventory: vi.fn(), adjustInventory: vi.fn(), transferInventory: vi.fn() }}
        generateKey={keyFactory("K1")}
        onRefresh={vi.fn()}
        write={write}
        items={items}
      />,
    );
    fireEvent.click(screen.getByTestId("open-adjust"));
    expect(
      screen.getByTestId(`adjust-row-${rowKey(INVENTORY_LOCATION_A, VARIANT_A)}`),
    ).toBeTruthy();
    expect(
      screen.queryByTestId(`adjust-row-${rowKey(INVENTORY_LOCATION_B, VARIANT_A)}`),
    ).toBeNull();
  });

  it("on a stale-version conflict refreshes and requires a recount — never a blind retry", async () => {
    const onRefresh = vi.fn();
    const adjustInventory = vi
      .fn()
      .mockRejectedValueOnce(new ApiHttpError("no", 409, "CONCURRENT_MODIFICATION", null))
      .mockResolvedValueOnce(adjustResponse({ newOnHand: 24, version: 6 }));
    const generateKey = keyFactory("K1", "K2");
    const client = { receiveInventory: vi.fn(), adjustInventory, transferInventory: vi.fn() };
    const { rerender } = render(
      <Harness client={client} generateKey={generateKey} onRefresh={onRefresh} />,
    );

    fireEvent.click(screen.getByTestId("open-adjust"));
    fireEvent.click(screen.getByTestId(`adjust-row-${rowKey(INVENTORY_LOCATION_A, VARIANT_A)}`));
    typeInto("adjust-counted", "25");
    fireEvent.click(screen.getByTestId("adjust-submit"));

    expect(await screen.findByTestId("inventory-concurrency-notice")).toBeTruthy();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(adjustInventory).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("write-retry")).toBeNull();
    expect(screen.queryByTestId("adjust-counted")).toBeNull();

    const refreshedItems = ITEMS.map((item) => ({ ...item, onHand: 26, version: 5 }));
    rerender(
      <Harness
        client={client}
        generateKey={generateKey}
        onRefresh={onRefresh}
        items={refreshedItems}
      />,
    );
    fireEvent.click(screen.getByTestId("open-adjust"));
    fireEvent.click(screen.getByTestId(`adjust-row-${rowKey(INVENTORY_LOCATION_A, VARIANT_A)}`));
    typeInto("adjust-counted", "24");
    fireEvent.click(screen.getByTestId("adjust-submit"));

    expect(await screen.findByTestId("adjust-success")).toBeTruthy();
    expect(adjustInventory).toHaveBeenCalledTimes(2);
    expect(adjustInventory.mock.calls[0][0]).toMatchObject({
      expectedVersion: 2,
      idempotencyKey: "K1",
    });
    expect(adjustInventory.mock.calls[1][0]).toMatchObject({
      expectedVersion: 5,
      idempotencyKey: "K2",
    });
  });
});

describe("Transfer stock", () => {
  it("moves stock between two locations and reflects both sides from the server", async () => {
    const onRefresh = vi.fn();
    const transferInventory = vi.fn().mockResolvedValue(
      transferResponse({
        source: {
          inventoryLocationId: INVENTORY_LOCATION_A,
          observedOnHand: 20,
          observedVersion: 3,
        },
        destination: {
          inventoryLocationId: INVENTORY_LOCATION_B,
          observedOnHand: 2,
          observedVersion: 1,
        },
      }),
    );
    render(
      <Harness
        client={{ receiveInventory: vi.fn(), adjustInventory: vi.fn(), transferInventory }}
        generateKey={keyFactory("K1")}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTestId("open-transfer"));
    fireEvent.click(screen.getByTestId(`transfer-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`transfer-source-${INVENTORY_LOCATION_A}`));
    fireEvent.click(screen.getByTestId(`transfer-destination-${INVENTORY_LOCATION_B}`));
    typeInto("transfer-quantity", "2");
    fireEvent.click(screen.getByTestId("transfer-submit"));

    expect(await screen.findByTestId("transfer-success")).toBeTruthy();
    expect(transferInventory).toHaveBeenCalledWith({
      variantId: VARIANT_A,
      sourceInventoryLocationId: INVENTORY_LOCATION_A,
      destinationInventoryLocationId: INVENTORY_LOCATION_B,
      quantity: 2,
      idempotencyKey: "K1",
    });
    expect(screen.getByTestId("transfer-source-onhand").textContent).toBe("20");
    expect(screen.getByTestId("transfer-destination-onhand").textContent).toBe("2");
    expect(onRefresh).toHaveBeenCalled();
  });

  it("prevents choosing the same location as source and destination", () => {
    const transferInventory = vi.fn();
    render(
      <Harness
        client={{ receiveInventory: vi.fn(), adjustInventory: vi.fn(), transferInventory }}
        generateKey={keyFactory("K1")}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("open-transfer"));
    fireEvent.click(screen.getByTestId(`transfer-source-${INVENTORY_LOCATION_A}`));
    // The source location is disabled in the destination list.
    const destSameAsSource = screen.getByTestId(`transfer-destination-${INVENTORY_LOCATION_A}`);
    expect(destSameAsSource.getAttribute("aria-disabled")).toBe("true");
  });

  it("blocks a duplicate submit while the transfer is in flight", () => {
    const transferInventory = vi.fn().mockReturnValue(new Promise(() => {}));
    render(
      <Harness
        client={{ receiveInventory: vi.fn(), adjustInventory: vi.fn(), transferInventory }}
        generateKey={keyFactory("K1", "K2")}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("open-transfer"));
    fireEvent.click(screen.getByTestId(`transfer-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`transfer-source-${INVENTORY_LOCATION_A}`));
    fireEvent.click(screen.getByTestId(`transfer-destination-${INVENTORY_LOCATION_B}`));
    typeInto("transfer-quantity", "2");
    fireEvent.click(screen.getByTestId("transfer-submit"));
    fireEvent.click(screen.getByTestId("transfer-submit"));

    expect(transferInventory).toHaveBeenCalledTimes(1);
  });
});

// Phase 2N prepares Receive for an OPTIONAL Supplier selection. The seam is structural only: without a
// slot the flow is byte-for-byte unchanged, and even with a slot no supplier value is added to the
// receive request (inventing a supplierId field before the API contract exists is deliberately avoided).
describe("Phase 2N supplier receive seam", () => {
  const baseProps = {
    locations: LOCATIONS,
    write: WRITE_ACCESS,
    items: ITEMS,
    onConcurrencyConflict: vi.fn(),
  };

  it("renders no supplier field when no slot is provided (Receive is unchanged)", () => {
    render(
      <InventoryOperations
        {...baseProps}
        client={{ receiveInventory: vi.fn(), adjustInventory: vi.fn(), transferInventory: vi.fn() }}
        onRefresh={vi.fn()}
        generateIdempotencyKey={keyFactory("K1")}
      />,
    );
    fireEvent.click(screen.getByTestId("open-receive"));
    expect(screen.queryByTestId("supplier-receive-slot")).toBeNull();
    expect(screen.getByTestId("receive-submit")).toBeTruthy();
  });

  it("renders a provided supplier slot and still receives with unchanged args (no supplier data sent)", async () => {
    const receiveInventory = vi.fn().mockResolvedValue(receiveResponse());
    render(
      <InventoryOperations
        {...baseProps}
        client={{ receiveInventory, adjustInventory: vi.fn(), transferInventory: vi.fn() }}
        onRefresh={vi.fn()}
        generateIdempotencyKey={keyFactory("K1")}
        receiveSupplierSlot={<span data-testid="supplier-receive-slot">supplier picker</span>}
      />,
    );
    fireEvent.click(screen.getByTestId("open-receive"));
    expect(screen.getByTestId("supplier-receive-slot")).toBeTruthy();

    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    typeInto("receive-quantity", "5");
    fireEvent.click(screen.getByTestId("receive-submit"));

    expect(await screen.findByTestId("receive-success")).toBeTruthy();
    // The request carries no supplier field — exactly the current contract.
    expect(receiveInventory).toHaveBeenCalledWith({
      variantId: VARIANT_A,
      inventoryLocationId: INVENTORY_LOCATION_A,
      quantity: 5,
      idempotencyKey: "K1",
    });
  });
});
