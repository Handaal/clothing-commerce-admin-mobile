// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import {
  INVENTORY_LOCATION_A,
  INVENTORY_LOCATION_B,
  SUPPLIER_A,
  VARIANT_A,
  adjustResponse,
  inventoryItem,
  receiveResponse,
  transferResponse,
} from "../../test-support/fixtures";
import { InventoryOperations, type InventoryWriteAccess } from "../InventoryOperations";
import { createInventoryJournal, type InventoryJournal } from "./journal";
import { createMemoryJournalStore, type JournalStore } from "./store";

const TENANT = "11111111-1111-4111-8111-111111111111";

const LOCATIONS = [
  { id: INVENTORY_LOCATION_A, name: "Flagship Stockroom", branchId: null },
  { id: INVENTORY_LOCATION_B, name: "Overflow Stockroom", branchId: null },
];

const WRITE_ACCESS: InventoryWriteAccess = {
  canReceive: true,
  canAdjust: true,
  canTransfer: true,
  locations: LOCATIONS.map(({ id, name }) => ({
    id,
    name,
    canReceive: true,
    canAdjust: true,
    canTransferOrigin: true,
    canTransferDestination: true,
  })),
};

const ITEMS = [
  inventoryItem({
    variantId: VARIANT_A,
    inventoryLocationId: INVENTORY_LOCATION_A,
    productName: "Linen Shirt",
    sku: "LS-001-M",
    onHand: 10,
    version: 2,
  }),
];

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

/**
 * A minimal fake Commerce API for the three inventory writes. It is idempotent by key: a command is
 * APPLIED at most once per idempotency key (subsequent calls with the same key return the cached result
 * without changing state), exactly like the real server. In `lossy` mode a command still commits but the
 * response is lost (network error) — the ambiguous outcome the journal exists to survive.
 */
function fakeApi() {
  const applied = new Map<string, unknown>();
  const calls: { key: string; op: string }[] = [];
  let stock = 10;
  let lossy = false;
  let rejectReplayWith: Error | null = null;

  function once<T>(key: string, op: string, apply: () => T): T {
    calls.push({ key, op });
    if (applied.has(key)) {
      if (rejectReplayWith) throw rejectReplayWith;
      if (lossy) throw new ApiNetworkError("lost again");
      return applied.get(key) as T;
    }
    const result = apply();
    applied.set(key, result);
    if (lossy) throw new ApiNetworkError("committed but response lost");
    return result;
  }

  return {
    calls,
    get stock() {
      return stock;
    },
    get appliedCount() {
      return applied.size;
    },
    setLossy(value: boolean) {
      lossy = value;
    },
    failReplayWith(error: Error | null) {
      rejectReplayWith = error;
    },
    client: {
      receiveInventory: vi.fn(
        async ({ idempotencyKey, quantity }: { idempotencyKey: string; quantity: number }) =>
          once(idempotencyKey, "receive", () => {
            stock += quantity;
            return receiveResponse({ observedOnHand: stock });
          }),
      ),
      adjustInventory: vi.fn(
        async ({
          idempotencyKey,
          countedQuantity,
        }: {
          idempotencyKey: string;
          countedQuantity: number;
        }) =>
          once(idempotencyKey, "adjust", () => {
            const previous = stock;
            stock = countedQuantity;
            return adjustResponse({ previousOnHand: previous, newOnHand: stock, version: 3 });
          }),
      ),
      transferInventory: vi.fn(async ({ idempotencyKey }: { idempotencyKey: string }) =>
        once(idempotencyKey, "transfer", () => transferResponse()),
      ),
    },
  };
}

function renderOps(journal: InventoryJournal, client: ReturnType<typeof fakeApi>["client"]) {
  const onRefresh = vi.fn();
  render(
    <InventoryOperations
      client={client}
      journal={journal}
      tenantId={TENANT}
      locations={LOCATIONS}
      write={WRITE_ACCESS}
      items={ITEMS}
      onRefresh={onRefresh}
      onConcurrencyConflict={vi.fn()}
    />,
  );
  return { onRefresh };
}

afterEach(() => cleanup());

describe("inventory mutation crash recovery", () => {
  it("recovers a receive whose response was lost and applies it exactly once (B10)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();

    // FIRST APP CONTEXT — receive +2, but the response is lost after the server commits.
    api.setLossy(true);
    let journal = createInventoryJournal(store, keyFactory("K1"));
    renderOps(journal, api.client);
    fireEvent.click(screen.getByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("receive-submit"));

    // The ambiguous failure surfaces a retry; the server already moved stock 10 → 12.
    await screen.findByTestId("write-retry");
    expect(api.stock).toBe(12);
    expect(api.appliedCount).toBe(1);

    // SIMULATE RESTART: tear down the UI and reopen a NEW journal over the SAME durable storage.
    cleanup();
    api.setLossy(false);
    journal = createInventoryJournal(store, keyFactory("SHOULD-NOT-MINT"));
    renderOps(journal, api.client);

    // Recovery surfaces the unresolved command; completing it replays the ORIGINAL key K1.
    await screen.findByTestId("inventory-recovery");
    fireEvent.click(await screen.findByTestId("recovery-replay-K1"));
    await screen.findByTestId("recovery-resolved-K1");

    // Applied exactly once — stock is still 12, not 14 — and both calls used the same key.
    expect(api.stock).toBe(12);
    expect(api.appliedCount).toBe(1);
    const receiveKeys = api.calls.filter((c) => c.op === "receive").map((c) => c.key);
    expect(receiveKeys).toEqual(["K1", "K1"]);

    // Acknowledging clears the recovery surface.
    fireEvent.click(screen.getByTestId("recovery-ack-K1"));
    await waitFor(() => expect(screen.queryByTestId("inventory-recovery")).toBeNull());
  });

  it("retains the supplier link and metadata through recovery", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    let journal = createInventoryJournal(store, keyFactory("KS"));
    renderOps(journal, api.client);

    fireEvent.click(screen.getByTestId("open-receive"));
    // Supplier options must be provided for the supplier field to appear.
    cleanup();
    render(
      <InventoryOperations
        client={api.client}
        journal={journal}
        tenantId={TENANT}
        locations={LOCATIONS}
        write={WRITE_ACCESS}
        items={ITEMS}
        onRefresh={vi.fn()}
        onConcurrencyConflict={vi.fn()}
        receiveSuppliers={[{ value: SUPPLIER_A, label: "Nile Textiles · SUP-001" }]}
      />,
    );
    fireEvent.click(screen.getByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.click(screen.getByTestId(`receive-supplier-${SUPPLIER_A}`));
    fireEvent.change(screen.getByTestId("receive-supplier-reference"), {
      target: { value: "GRN-77" },
    });
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("write-retry");

    // The persisted command retains the exact supplier metadata for replay.
    const [pending] = await journal.findUnresolved(TENANT);
    expect(pending?.payload).toMatchObject({
      type: "receive",
      supplierId: SUPPLIER_A,
      supplierReference: "GRN-77",
      quantity: 3,
    });

    // Restart and recover: the replay carries supplierId + reference to the API verbatim.
    cleanup();
    api.setLossy(false);
    journal = createInventoryJournal(store, keyFactory("NOPE"));
    renderOps(journal, api.client);
    await screen.findByTestId("recovery-replay-KS");
    fireEvent.click(screen.getByTestId("recovery-replay-KS"));
    await screen.findByTestId("recovery-resolved-KS");
    expect(api.client.receiveInventory).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: "KS",
        supplierId: SUPPLIER_A,
        supplierReference: "GRN-77",
        quantity: 3,
      }),
    );
  });

  it("recovers an adjust command after restart", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    let journal = createInventoryJournal(store, keyFactory("KA"));
    renderOps(journal, api.client);

    fireEvent.click(screen.getByTestId("open-adjust"));
    fireEvent.click(screen.getByTestId(`adjust-row-${INVENTORY_LOCATION_A}:${VARIANT_A}`));
    fireEvent.change(screen.getByTestId("adjust-counted"), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("adjust-submit"));
    await screen.findByTestId("write-retry");
    expect(api.stock).toBe(25);

    cleanup();
    api.setLossy(false);
    journal = createInventoryJournal(store, keyFactory("NOPE"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("recovery-replay-KA"));
    await screen.findByTestId("recovery-resolved-KA");
    expect(api.appliedCount).toBe(1); // applied once
    const adjustKeys = api.calls.filter((c) => c.op === "adjust").map((c) => c.key);
    expect(adjustKeys).toEqual(["KA", "KA"]);
  });

  it("recovers a transfer command after restart", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    let journal = createInventoryJournal(store, keyFactory("KT"));
    renderOps(journal, api.client);

    fireEvent.click(screen.getByTestId("open-transfer"));
    fireEvent.click(screen.getByTestId(`transfer-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`transfer-source-${INVENTORY_LOCATION_A}`));
    fireEvent.click(screen.getByTestId(`transfer-destination-${INVENTORY_LOCATION_B}`));
    fireEvent.change(screen.getByTestId("transfer-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("transfer-submit"));
    await screen.findByTestId("write-retry");

    cleanup();
    api.setLossy(false);
    journal = createInventoryJournal(store, keyFactory("NOPE"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("recovery-replay-KT"));
    await screen.findByTestId("recovery-resolved-KT");
    const transferKeys = api.calls.filter((c) => c.op === "transfer").map((c) => c.key);
    expect(transferKeys).toEqual(["KT", "KT"]);
    expect(api.appliedCount).toBe(1);
  });

  it("shows an invariant conflict and does not silently apply when a replay is rejected as a duplicate", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    let journal = createInventoryJournal(store, keyFactory("KC"));
    renderOps(journal, api.client);
    fireEvent.click(screen.getByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("write-retry");

    // On restart, the server rejects the replay with an idempotency conflict (same key, different
    // details recorded server-side). The recovery surface shows it and discards — never silently retried.
    cleanup();
    api.setLossy(false);
    api.failReplayWith(new ApiHttpError("conflict", 409, "IDEMPOTENCY_CONFLICT", null));
    journal = createInventoryJournal(store, keyFactory("NOPE"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("recovery-replay-KC"));
    await screen.findByTestId("recovery-rejected-KC");
    fireEvent.click(screen.getByTestId("recovery-ack-KC"));
    await waitFor(() => expect(screen.queryByTestId("inventory-recovery")).toBeNull());
    expect(await journal.findUnresolved(TENANT)).toHaveLength(0);
  });

  it("keeps unrelated inventory reads usable while a command is unresolved", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    const journal = createInventoryJournal(store, keyFactory("K1"));
    renderOps(journal, api.client);
    fireEvent.click(screen.getByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("write-retry");

    // The operation surface (its read affordances) remains fully interactive despite the pending command.
    expect(screen.getByTestId("open-adjust")).toBeTruthy();
    expect(screen.getByTestId("open-transfer")).toBeTruthy();
  });

  it("does not mint a second key for an equivalent command while one is unresolved (B1/B5)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const journal = createInventoryJournal(store, keyFactory("K1", "K2"));
    // A command is prepared and left unresolved (as after an ambiguous send).
    const first = await journal.prepare(TENANT, {
      type: "receive",
      variantId: VARIANT_A,
      inventoryLocationId: INVENTORY_LOCATION_A,
      quantity: 2,
    });
    const equivalent = await journal.prepare(TENANT, {
      type: "receive",
      variantId: VARIANT_A,
      inventoryLocationId: INVENTORY_LOCATION_A,
      quantity: 2,
    });
    expect(equivalent.commandKey).toBe(first.commandKey);
    expect(await journal.findUnresolved(TENANT)).toHaveLength(1);
  });
});
