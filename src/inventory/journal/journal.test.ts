import { describe, expect, it } from "vitest";

import { createInventoryJournal as baseCreateInventoryJournal } from "./journal";

// These unit tests exercise journal logic in a Node runtime (which looks like "web without Web Locks"
// under react-native-web). Inject a safe cross-context capability so the fail-closed mutation guard does
// not fire here; the guard itself is covered directly in fail-closed.test.ts.
function createInventoryJournal(
  ...args: Parameters<typeof baseCreateInventoryJournal>
): ReturnType<typeof baseCreateInventoryJournal> {
  const [store, owner, generateKey, now] = args;
  return baseCreateInventoryJournal(store, owner, generateKey, now, () => true);
}
import {
  JournalTransitionError,
  normalizeAdjustPayload,
  normalizeReceivePayload,
  type JournalOwner,
  type JournalPayload,
} from "./model";
import { createMemoryJournalStore, type JournalStore } from "./store";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const MEMBER_A = "33333333-3333-4333-8333-333333333333";
const MEMBER_B = "44444444-4444-4444-8444-444444444444";
const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const OWNER_A: JournalOwner = { tenantId: TENANT_A, membershipId: MEMBER_A };

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

const receive = (quantity: number): JournalPayload =>
  normalizeReceivePayload({ variantId: VARIANT, inventoryLocationId: LOCATION, quantity });

describe("inventory journal", () => {
  it("prepares a command with a durable key and a prepared status", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER_A, keyFactory("K1"));
    const entry = await journal.prepare(receive(2));
    expect(entry).toMatchObject({
      commandKey: "K1",
      tenantId: TENANT_A,
      actorMembershipId: MEMBER_A,
      status: "prepared",
    });
    expect(await journal.findRecoverable()).toHaveLength(1);
  });

  it("reuses the existing key for an equivalent command that is still unresolved", async () => {
    const journal = createInventoryJournal(
      createMemoryJournalStore(),
      OWNER_A,
      keyFactory("K1", "K2"),
    );
    const first = await journal.prepare(receive(2));
    const again = await journal.prepare(receive(2));
    expect(again.commandKey).toBe(first.commandKey); // K1 reused — never a second key
    expect(await journal.findRecoverable()).toHaveLength(1);
  });

  it("mints a distinct key for a genuinely different command", async () => {
    const journal = createInventoryJournal(
      createMemoryJournalStore(),
      OWNER_A,
      keyFactory("K1", "K2"),
    );
    const a = await journal.prepare(receive(2));
    const b = await journal.prepare(receive(3));
    expect(b.commandKey).not.toBe(a.commandKey);
    expect(await journal.findRecoverable()).toHaveLength(2);
  });

  it("moves a command through sent → accepted and keeps the server result (resolved, not pruned)", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER_A, keyFactory("K1"));
    const entry = await journal.prepare(receive(2));
    await journal.markSent(entry.commandKey);
    await journal.recordAccepted(entry.commandKey, { observedOnHand: 12 });
    const stored = await journal.get(entry.commandKey);
    expect(stored).toMatchObject({ status: "accepted", result: { observedOnHand: 12 } });
    // Accepted is resolved but NOT acknowledged: it stays in the recoverable set until acknowledged.
    expect(await journal.findRecoverable()).toHaveLength(1);
  });

  it("keeps an accepted command across a simulated restart until it is acknowledged (P1-1)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const first = createInventoryJournal(store, OWNER_A, keyFactory("K1"));
    const entry = await first.prepare(receive(2));
    await first.markSent(entry.commandKey);
    await first.recordAccepted(entry.commandKey, { observedOnHand: 12 });

    // Simulate a restart: a brand-new journal instance over the SAME durable storage. Nothing is
    // auto-pruned; the accepted result is still present and recoverable.
    const restarted = createInventoryJournal(store, OWNER_A, keyFactory("SHOULD-NOT-BE-USED"));
    const recovered = await restarted.findRecoverable();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ commandKey: "K1", status: "accepted" });

    // Only an explicit acknowledgement prunes it.
    await restarted.acknowledge("K1");
    expect(await restarted.findRecoverable()).toHaveLength(0);
    expect(await restarted.get("K1")).toBeNull();
  });

  it("refuses to acknowledge (discard) an unresolved command (P1-1)", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER_A, keyFactory("K1"));
    const entry = await journal.prepare(receive(2));
    await journal.markSent(entry.commandKey);
    await expect(journal.acknowledge(entry.commandKey)).rejects.toBeInstanceOf(
      JournalTransitionError,
    );
    // Still present and unresolved — its durable key was not destroyed.
    expect(await journal.findRecoverable()).toHaveLength(1);
  });

  it("records a definite rejection as a resolved, kept state (not deleted)", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER_A, keyFactory("K1"));
    const entry = await journal.prepare(receive(2));
    await journal.markSent(entry.commandKey);
    await journal.recordRejected(entry.commandKey);
    const stored = await journal.get(entry.commandKey);
    expect(stored?.status).toBe("rejected");
    // Rejected is resolved but kept until acknowledged, then safely pruned.
    expect(await journal.findRecoverable()).toHaveLength(1);
    await journal.acknowledge(entry.commandKey);
    expect(await journal.get(entry.commandKey)).toBeNull();
  });

  it("fails a transition whose target entry disappeared (P1-3 invariant)", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER_A, keyFactory("K1"));
    await expect(journal.markSent("missing")).rejects.toBeInstanceOf(JournalTransitionError);
    await expect(journal.recordAccepted("missing", {})).rejects.toBeInstanceOf(
      JournalTransitionError,
    );
  });

  it("fails an illegal status transition (sent → already-resolved cannot re-send)", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER_A, keyFactory("K1"));
    const entry = await journal.prepare(receive(2));
    await journal.markSent(entry.commandKey);
    await journal.recordAccepted(entry.commandKey, {});
    await expect(journal.markSent(entry.commandKey)).rejects.toBeInstanceOf(JournalTransitionError);
    await expect(journal.recordRejected(entry.commandKey)).rejects.toBeInstanceOf(
      JournalTransitionError,
    );
  });

  it("isolates commands by owner (tenant AND membership) over a shared store (P1-4)", async () => {
    const store: JournalStore = createMemoryJournalStore();
    const ownerA = createInventoryJournal(store, OWNER_A, keyFactory("KA"));
    const ownerBsameTenant = createInventoryJournal(
      store,
      { tenantId: TENANT_A, membershipId: MEMBER_B },
      keyFactory("KB"),
    );
    const otherTenant = createInventoryJournal(
      store,
      { tenantId: TENANT_B, membershipId: MEMBER_A },
      keyFactory("KC"),
    );

    const a = await ownerA.prepare(receive(2));

    // A different membership on the SAME tenant/device cannot see, replay, or acknowledge A's command.
    expect(await ownerBsameTenant.findRecoverable()).toHaveLength(0);
    expect(await ownerBsameTenant.get(a.commandKey)).toBeNull();
    await expect(ownerBsameTenant.markSent(a.commandKey)).rejects.toBeInstanceOf(
      JournalTransitionError,
    );
    await expect(ownerBsameTenant.acknowledge(a.commandKey)).rejects.toBeInstanceOf(
      JournalTransitionError,
    );
    // A different tenant likewise cannot see it.
    expect(await otherTenant.findRecoverable()).toHaveLength(0);

    // The originating owner still sees it (recoverable when they return), and it was never deleted.
    expect(await ownerA.findRecoverable()).toHaveLength(1);
    expect((await ownerA.findRecoverable())[0]?.commandKey).toBe("KA");
  });

  it("serializes concurrent prepares so no entry is lost (P1-3)", async () => {
    // A store whose writes resolve on a later microtask, maximizing the read-modify-write overlap window.
    const backing = createMemoryJournalStore();
    const slowStore: JournalStore = {
      read: () => backing.read(),
      write: async (document) => {
        await Promise.resolve();
        await backing.write(document);
      },
    };
    const journal = createInventoryJournal(slowStore, OWNER_A, keyFactory("K1", "K2", "K3", "K4"));

    // Four genuinely-different commands prepared concurrently. Without serialization, overlapping
    // whole-document writes would clobber each other and lose entries.
    await Promise.all([
      journal.prepare(receive(2)),
      journal.prepare(receive(3)),
      journal.prepare(receive(4)),
      journal.prepare(receive(5)),
    ]);
    expect(await journal.findRecoverable()).toHaveLength(4);
  });

  it("finds the unresolved command equivalent to a payload", async () => {
    const journal = createInventoryJournal(createMemoryJournalStore(), OWNER_A, keyFactory("K1"));
    await journal.prepare(
      normalizeAdjustPayload({
        variantId: VARIANT,
        inventoryLocationId: LOCATION,
        countedQuantity: 10,
        expectedVersion: 2,
      }),
    );
    const match = await journal.findEquivalentUnresolved(
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
