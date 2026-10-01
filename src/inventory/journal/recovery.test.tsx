// @vitest-environment jsdom
import { ApiHttpError, ApiNetworkError } from "@shifted/clothing-commerce-sdk";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-crypto", () => ({ randomUUID: () => "unused-native-uuid" }));

import { installWebLocks, removeWebLocks } from "../../test-support/web-locks";

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
import type { JournalEntry, JournalOwner } from "./model";

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const MEMBER_B = "44444444-4444-4444-8444-444444444444";
const OWNER_A: JournalOwner = { tenantId: TENANT, membershipId: MEMBER_A };
const OWNER_B: JournalOwner = { tenantId: TENANT, membershipId: MEMBER_B };

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

const RECEIVE = (quantity: number): JournalEntry["payload"] => ({
  type: "receive",
  variantId: VARIANT_A,
  inventoryLocationId: INVENTORY_LOCATION_A,
  quantity,
});

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

function renderOps(
  journal: InventoryJournal,
  client: ReturnType<typeof fakeApi>["client"],
  extra: {
    detectLegacy?: () => Promise<JournalEntry[]>;
    quarantineLegacy?: () => Promise<void>;
    receiveSuppliers?: { value: string; label: string }[];
  } = {},
) {
  const onRefresh = vi.fn();
  render(
    <InventoryOperations
      client={client}
      journal={journal}
      locations={LOCATIONS}
      write={WRITE_ACCESS}
      items={ITEMS}
      onRefresh={onRefresh}
      onConcurrencyConflict={vi.fn()}
      detectLegacy={extra.detectLegacy}
      quarantineLegacy={extra.quarantineLegacy}
      receiveSuppliers={extra.receiveSuppliers}
    />,
  );
  return { onRefresh };
}

// Component specs model a supported browser (Web Locks present) unless a test opts out via removeWebLocks.
beforeEach(() => installWebLocks());
afterEach(() => {
  removeWebLocks();
  cleanup();
});

describe("inventory mutation crash recovery", () => {
  it("recovers a receive whose response was lost and applies it exactly once (B10)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();

    // FIRST APP CONTEXT — receive +2, but the response is lost after the server commits.
    api.setLossy(true);
    let journal = createInventoryJournal(store, OWNER_A, keyFactory("K1"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("receive-submit"));

    await screen.findByTestId("write-retry");
    expect(api.stock).toBe(12);
    expect(api.appliedCount).toBe(1);

    // SIMULATE RESTART: tear down the UI and reopen a NEW journal over the SAME durable storage.
    cleanup();
    api.setLossy(false);
    journal = createInventoryJournal(store, OWNER_A, keyFactory("SHOULD-NOT-MINT"));
    renderOps(journal, api.client);

    await screen.findByTestId("inventory-recovery");
    fireEvent.click(await screen.findByTestId("recovery-replay-K1"));
    await screen.findByTestId("recovery-resolved-K1");

    expect(api.stock).toBe(12);
    expect(api.appliedCount).toBe(1);
    const receiveKeys = api.calls.filter((c) => c.op === "receive").map((c) => c.key);
    expect(receiveKeys).toEqual(["K1", "K1"]);

    fireEvent.click(screen.getByTestId("recovery-ack-K1"));
    await waitFor(() => expect(screen.queryByTestId("inventory-recovery")).toBeNull());
  });

  it("keeps an ACCEPTED result after a crash before acknowledgement, then cleans up only on ack (P1-1)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();

    // Receive succeeds: server commits and the client records `accepted`.
    let journal = createInventoryJournal(store, OWNER_A, keyFactory("K1"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("receive-success");
    expect(await journal.get("K1")).toMatchObject({ status: "accepted" });

    // SIMULATE PROCESS DEATH before the operator acknowledged the success screen.
    cleanup();
    journal = createInventoryJournal(store, OWNER_A, keyFactory("NOPE"));
    renderOps(journal, api.client);

    // The accepted result survived and is surfaced for acknowledgement — not auto-pruned, not replayed.
    await screen.findByTestId("recovery-resolved-K1");
    expect(api.appliedCount).toBe(1);
    expect(api.stock).toBe(12);

    // Only the explicit acknowledgement cleans it up.
    fireEvent.click(screen.getByTestId("recovery-ack-K1"));
    await waitFor(() => expect(screen.queryByTestId("inventory-recovery")).toBeNull());
    expect(await journal.get("K1")).toBeNull();
  });

  it("offers no unsafe discard for an unresolved command — only completion (P1-1)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    const journal = createInventoryJournal(store, OWNER_A, keyFactory("K1"));
    await journal.prepare(RECEIVE(2));
    await journal.markSent("K1");
    renderOps(journal, api.client);

    await screen.findByTestId("recovery-entry-K1");
    // The completion affordance exists; the old destructive "Discard without completing" does not.
    expect(screen.getByTestId("recovery-replay-K1")).toBeTruthy();
    expect(screen.queryByText("Discard without completing")).toBeNull();
    // The durable entry is still present (never discardable merely to dismiss it).
    expect(await journal.findRecoverable()).toHaveLength(1);
  });

  it("retains the supplier link and metadata through recovery", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    let journal = createInventoryJournal(store, OWNER_A, keyFactory("KS"));
    renderOps(journal, api.client, {
      receiveSuppliers: [{ value: SUPPLIER_A, label: "Nile Textiles · SUP-001" }],
    });

    fireEvent.click(await screen.findByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.click(screen.getByTestId(`receive-supplier-${SUPPLIER_A}`));
    fireEvent.change(screen.getByTestId("receive-supplier-reference"), {
      target: { value: "GRN-77" },
    });
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("write-retry");

    const [pending] = await journal.findRecoverable();
    expect(pending?.payload).toMatchObject({
      type: "receive",
      supplierId: SUPPLIER_A,
      supplierReference: "GRN-77",
      quantity: 3,
    });

    cleanup();
    api.setLossy(false);
    journal = createInventoryJournal(store, OWNER_A, keyFactory("NOPE"));
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
    let journal = createInventoryJournal(store, OWNER_A, keyFactory("KA"));
    renderOps(journal, api.client);

    fireEvent.click(await screen.findByTestId("open-adjust"));
    fireEvent.click(screen.getByTestId(`adjust-row-${INVENTORY_LOCATION_A}:${VARIANT_A}`));
    fireEvent.change(screen.getByTestId("adjust-counted"), { target: { value: "25" } });
    fireEvent.click(screen.getByTestId("adjust-submit"));
    await screen.findByTestId("write-retry");
    expect(api.stock).toBe(25);

    cleanup();
    api.setLossy(false);
    journal = createInventoryJournal(store, OWNER_A, keyFactory("NOPE"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("recovery-replay-KA"));
    await screen.findByTestId("recovery-resolved-KA");
    expect(api.appliedCount).toBe(1);
    const adjustKeys = api.calls.filter((c) => c.op === "adjust").map((c) => c.key);
    expect(adjustKeys).toEqual(["KA", "KA"]);
  });

  it("recovers a transfer command after restart", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    let journal = createInventoryJournal(store, OWNER_A, keyFactory("KT"));
    renderOps(journal, api.client);

    fireEvent.click(await screen.findByTestId("open-transfer"));
    fireEvent.click(screen.getByTestId(`transfer-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`transfer-source-${INVENTORY_LOCATION_A}`));
    fireEvent.click(screen.getByTestId(`transfer-destination-${INVENTORY_LOCATION_B}`));
    fireEvent.change(screen.getByTestId("transfer-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("transfer-submit"));
    await screen.findByTestId("write-retry");

    cleanup();
    api.setLossy(false);
    journal = createInventoryJournal(store, OWNER_A, keyFactory("NOPE"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("recovery-replay-KT"));
    await screen.findByTestId("recovery-resolved-KT");
    const transferKeys = api.calls.filter((c) => c.op === "transfer").map((c) => c.key);
    expect(transferKeys).toEqual(["KT", "KT"]);
    expect(api.appliedCount).toBe(1);
  });

  it("shows a rejection and keeps it until dismissed when a replay is rejected as a duplicate", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    let journal = createInventoryJournal(store, OWNER_A, keyFactory("KC"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("write-retry");

    cleanup();
    api.setLossy(false);
    api.failReplayWith(new ApiHttpError("conflict", 409, "IDEMPOTENCY_CONFLICT", null));
    journal = createInventoryJournal(store, OWNER_A, keyFactory("NOPE"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("recovery-replay-KC"));
    await screen.findByTestId("recovery-rejected-KC");
    // Rejected is kept (resolved) until the operator dismisses it — never silently vanishes.
    expect(await journal.get("KC")).toMatchObject({ status: "rejected" });
    fireEvent.click(screen.getByTestId("recovery-ack-KC"));
    await waitFor(() => expect(screen.queryByTestId("inventory-recovery")).toBeNull());
    expect(await journal.findRecoverable()).toHaveLength(0);
  });

  it("keeps unrelated inventory reads usable while a command is unresolved", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    const journal = createInventoryJournal(store, OWNER_A, keyFactory("K1"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("write-retry");

    expect(screen.getByTestId("open-adjust")).toBeTruthy();
    expect(screen.getByTestId("open-transfer")).toBeTruthy();
  });

  it("directs an equivalent new submission to recovery and never mints a second key (P1 equivalent-intent)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);
    const journal = createInventoryJournal(store, OWNER_A, keyFactory("K1", "K2"));
    renderOps(journal, api.client);

    // First submit → ambiguous, left unresolved as K1.
    fireEvent.click(await screen.findByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("write-retry");

    // Re-submit the SAME intent: blocked and pointed at recovery, no second key.
    api.setLossy(false);
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("write-blocked-equivalent");
    expect(await journal.findRecoverable()).toHaveLength(1);
    const receiveKeys = api.calls.filter((c) => c.op === "receive").map((c) => c.key);
    expect(new Set(receiveKeys)).toEqual(new Set(["K1"]));
  });
});

describe("membership-scoped ownership (P1-4)", () => {
  it("hides, and refuses replay of, another membership's command; the owner recovers it on return", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    api.setLossy(true);

    // User A (same tenant/device) leaves an unresolved command.
    let journal = createInventoryJournal(store, OWNER_A, keyFactory("KA"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("open-receive"));
    fireEvent.click(screen.getByTestId(`receive-variant-${VARIANT_A}`));
    fireEvent.click(screen.getByTestId(`receive-location-${INVENTORY_LOCATION_A}`));
    fireEvent.change(screen.getByTestId("receive-quantity"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("receive-submit"));
    await screen.findByTestId("write-retry");

    // User B logs in on the same tenant/device: they must NOT see or be able to replay A's command.
    cleanup();
    const journalB = createInventoryJournal(store, OWNER_B, keyFactory("KB"));
    renderOps(journalB, api.client);
    await waitFor(() => expect(screen.queryByTestId("recovery-replay-KA")).toBeNull());
    expect(screen.queryByTestId("inventory-recovery")).toBeNull();
    expect(await journalB.findRecoverable()).toHaveLength(0);
    expect(await journalB.get("KA")).toBeNull();

    // User A returns and can still recover their command.
    cleanup();
    api.setLossy(false);
    journal = createInventoryJournal(store, OWNER_A, keyFactory("NOPE"));
    renderOps(journal, api.client);
    fireEvent.click(await screen.findByTestId("recovery-replay-KA"));
    await screen.findByTestId("recovery-resolved-KA");
  });
});

describe("legacy V1 journal quarantine (P1 migration)", () => {
  it("blocks new mutations and never auto-claims a legacy V1 command, then unblocks on archive", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    const journal = createInventoryJournal(store, OWNER_A, keyFactory("K1"));
    let legacyPresent = true;
    // A released V1 entry (no membership owner) that must never be auto-claimed/replayed.
    const detectLegacy = async (): Promise<JournalEntry[]> =>
      legacyPresent
        ? [
            {
              commandKey: "LEGACY",
              tenantId: TENANT,
              actorMembershipId: "",
              operationType: "receive",
              payload: RECEIVE(1),
              payloadIdentity: "legacy",
              preparedAt: "1970-01-01T00:00:00.000Z",
              status: "sent",
            },
          ]
        : [];
    const quarantineLegacy = async () => {
      legacyPresent = false;
    };
    renderOps(journal, api.client, { detectLegacy, quarantineLegacy });

    // Legacy present → blocking notice, no write forms, no auto-replay.
    await screen.findByTestId("inventory-recovery-legacy");
    expect(screen.queryByTestId("open-receive")).toBeNull();
    expect(api.client.receiveInventory).not.toHaveBeenCalled();

    // Operator archives it → write forms return.
    fireEvent.click(screen.getByTestId("recovery-legacy-archive"));
    await screen.findByTestId("open-receive");
  });

  it("without Web Locks: shows legacy evidence read-only — NO enabled Archive action (P1-1 / F10)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    const journal = createInventoryJournal(store, OWNER_A, keyFactory("K1"));
    const detectLegacy = async (): Promise<JournalEntry[]> => [
      {
        commandKey: "LEGACY",
        tenantId: TENANT,
        actorMembershipId: "",
        operationType: "receive",
        payload: RECEIVE(1),
        payloadIdentity: "legacy",
        preparedAt: "1970-01-01T00:00:00.000Z",
        status: "sent",
      },
    ];
    const quarantineLegacy = vi.fn(async () => {});

    removeWebLocks(); // unsupported browser
    renderOps(journal, api.client, { detectLegacy, quarantineLegacy });

    // Evidence is visible, but the mutating Archive action is NOT offered — only an explanation.
    await screen.findByTestId("inventory-recovery-legacy");
    await screen.findByTestId("recovery-legacy-incompatible");
    expect(screen.queryByTestId("recovery-legacy-archive")).toBeNull();
    expect(screen.queryByTestId("open-receive")).toBeNull();
    expect(quarantineLegacy).not.toHaveBeenCalled();
    expect(api.client.receiveInventory).not.toHaveBeenCalled();
  });
});

describe("durable storage failure (P1-2)", () => {
  it("shows a blocking state and issues ZERO API requests when the journal is corrupt", async () => {
    const api = fakeApi();
    const corruptStore: JournalStore = {
      read: async () => {
        const { JournalCorruptError } = await import("./model");
        throw new JournalCorruptError("corrupt");
      },
      write: async () => undefined,
    };
    const journal = createInventoryJournal(corruptStore, OWNER_A, keyFactory("K1"));
    renderOps(journal, api.client);

    await screen.findByTestId("inventory-recovery-blocked");
    // Write forms are hidden (fail closed); read-only inventory elsewhere is unaffected.
    expect(screen.queryByTestId("open-receive")).toBeNull();
    expect(api.client.receiveInventory).not.toHaveBeenCalled();
  });
});

describe("fail-closed initialization (P1-4C)", () => {
  it("hides write forms until the availability checks finish — no submission window at startup", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    const journal = createInventoryJournal(store, OWNER_A, keyFactory("K1"));
    renderOps(journal, api.client);

    // Immediately after the first render — before the async V2/V1 checks resolve — every write form is
    // absent, so there is no frame where a mutation could be submitted.
    expect(screen.queryByTestId("open-receive")).toBeNull();
    expect(screen.queryByTestId("open-adjust")).toBeNull();
    expect(screen.queryByTestId("open-transfer")).toBeNull();

    // Only after the checks report availability do the forms appear.
    await screen.findByTestId("open-receive");
  });
});

describe("web without Web Locks fails closed (P1-3)", () => {
  it("hides all write forms and shows a compatibility notice; the API is never called", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();
    const journal = createInventoryJournal(store, OWNER_A, keyFactory("K1"));

    removeWebLocks(); // simulate an unsupported browser (no cross-tab lock)
    renderOps(journal, api.client);

    await screen.findByTestId("inventory-recovery-incompatible");
    expect(screen.queryByTestId("open-receive")).toBeNull();
    expect(screen.queryByTestId("open-adjust")).toBeNull();
    expect(screen.queryByTestId("open-transfer")).toBeNull();
    expect(api.calls).toHaveLength(0);
  });

  it("still lists unfinished operations READ-ONLY (no replay/ack) and never transports", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const api = fakeApi();

    // Seed an unresolved command while Web Locks is available, then simulate the unsupported browser.
    const seedJournal = createInventoryJournal(store, OWNER_A, keyFactory("K1"));
    const prepared = await seedJournal.prepare(RECEIVE(2));
    await seedJournal.markSent(prepared.commandKey);

    removeWebLocks();
    const journal = createInventoryJournal(store, OWNER_A, keyFactory("UNUSED"));
    renderOps(journal, api.client);

    // The pending operation is visible, but its write action is disabled and nothing is sent.
    await screen.findByTestId("recovery-entry-K1");
    await screen.findByTestId("inventory-recovery-incompatible");
    expect(screen.queryByTestId("recovery-replay-K1")).toBeNull();
    expect(screen.queryByTestId("open-receive")).toBeNull();
    expect(api.calls).toHaveLength(0);
  });
});
