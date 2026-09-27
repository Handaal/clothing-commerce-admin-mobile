import { describe, expect, it } from "vitest";

import { createInventoryJournal } from "./journal";
import { normalizeAdjustPayload, normalizeReceivePayload, type JournalPayload } from "./model";
import { createMemoryJournalStore, type JournalStore } from "./store";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

const receive = (quantity: number): JournalPayload =>
  normalizeReceivePayload({ variantId: VARIANT, inventoryLocationId: LOCATION, quantity });

describe("inventory journal", () => {
  it("prepares a command with a durable key and a prepared status", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1"));
    const entry = await journal.prepare(TENANT_A, receive(2));
    expect(entry).toMatchObject({ commandKey: "K1", tenantId: TENANT_A, status: "prepared" });
    expect(await journal.findUnresolved(TENANT_A)).toHaveLength(1);
  });

  it("reuses the existing key for an equivalent command that is still unresolved", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1", "K2"));
    const first = await journal.prepare(TENANT_A, receive(2));
    const again = await journal.prepare(TENANT_A, receive(2));
    expect(again.commandKey).toBe(first.commandKey); // K1 reused — never a second key
    expect(await journal.findUnresolved(TENANT_A)).toHaveLength(1);
  });

  it("mints a distinct key for a genuinely different command", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1", "K2"));
    const a = await journal.prepare(TENANT_A, receive(2));
    const b = await journal.prepare(TENANT_A, receive(3));
    expect(b.commandKey).not.toBe(a.commandKey);
    expect(await journal.findUnresolved(TENANT_A)).toHaveLength(2);
  });

  it("moves a command through sent → accepted and keeps the server result", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1"));
    const entry = await journal.prepare(TENANT_A, receive(2));
    await journal.markSent(entry.commandKey);
    await journal.recordAccepted(entry.commandKey, { observedOnHand: 12 });
    const stored = await journal.get(entry.commandKey);
    expect(stored).toMatchObject({ status: "accepted", result: { observedOnHand: 12 } });
    // Accepted is resolved — it no longer appears in the unresolved recovery set.
    expect(await journal.findUnresolved(TENANT_A)).toHaveLength(0);
  });

  it("persists a prepared command across a simulated restart (new journal, same storage)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const first = createInventoryJournal(store, keyFactory("K1"));
    const entry = await first.prepare(TENANT_A, receive(2));
    await first.markSent(entry.commandKey);

    // Simulate a restart: a brand-new journal instance over the SAME durable storage.
    const restarted = createInventoryJournal(store, keyFactory("SHOULD-NOT-BE-USED"));
    const recovered = await restarted.findUnresolved(TENANT_A);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ commandKey: "K1", status: "sent" });
    expect(recovered[0]?.payload).toEqual(receive(2)); // exact payload retained
  });

  it("isolates commands by tenant", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("KA", "KB"));
    await journal.prepare(TENANT_A, receive(2));
    await journal.prepare(TENANT_B, receive(2));
    expect(await journal.findUnresolved(TENANT_A)).toHaveLength(1);
    expect(await journal.findUnresolved(TENANT_B)).toHaveLength(1);
    expect((await journal.findUnresolved(TENANT_A))[0]?.tenantId).toBe(TENANT_A);
    // An equivalent command in another tenant never reuses this tenant's key.
    expect((await journal.findUnresolved(TENANT_A))[0]?.commandKey).toBe("KA");
    expect((await journal.findUnresolved(TENANT_B))[0]?.commandKey).toBe("KB");
  });

  it("discards a command that never applied, leaving nothing to recover", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1"));
    const entry = await journal.prepare(TENANT_A, receive(2));
    await journal.discard(entry.commandKey);
    expect(await journal.findUnresolved(TENANT_A)).toHaveLength(0);
    expect(await journal.get(entry.commandKey)).toBeNull();
  });

  it("acknowledges (prunes) a resolved command", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1"));
    const entry = await journal.prepare(TENANT_A, receive(2));
    await journal.recordAccepted(entry.commandKey, {});
    await journal.acknowledge(entry.commandKey);
    expect(await journal.get(entry.commandKey)).toBeNull();
  });

  it("prunes only resolved commands for a tenant, never unresolved ones", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1", "K2"));
    const resolved = await journal.prepare(TENANT_A, receive(2));
    await journal.recordAccepted(resolved.commandKey, {});
    const pending = await journal.prepare(TENANT_A, receive(3));
    await journal.markSent(pending.commandKey);

    await journal.pruneResolved(TENANT_A);
    expect(await journal.get(resolved.commandKey)).toBeNull();
    expect(await journal.get(pending.commandKey)).not.toBeNull();
  });

  it("finds the unresolved command equivalent to a payload", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), keyFactory("K1"));
    await journal.prepare(
      TENANT_A,
      normalizeAdjustPayload({
        variantId: VARIANT,
        inventoryLocationId: LOCATION,
        countedQuantity: 10,
        expectedVersion: 2,
      }),
    );
    const match = await journal.findEquivalentUnresolved(
      TENANT_A,
      normalizeAdjustPayload({
        variantId: VARIANT,
        inventoryLocationId: LOCATION,
        countedQuantity: 10,
        expectedVersion: 2,
      }),
    );
    expect(match?.commandKey).toBe("K1");
    // A recount against a new version is NOT equivalent — it is a new command.
    const noMatch = await journal.findEquivalentUnresolved(
      TENANT_A,
      normalizeAdjustPayload({
        variantId: VARIANT,
        inventoryLocationId: LOCATION,
        countedQuantity: 10,
        expectedVersion: 3,
      }),
    );
    expect(noMatch).toBeNull();
  });
});
