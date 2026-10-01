import { afterEach, describe, expect, it } from "vitest";

import { resetNamespaceCoordinators } from "./coordinator";
import { createInventoryJournal } from "./journal";
import { normalizeReceivePayload, type JournalOwner, type JournalPayload } from "./model";
import { createMemoryJournalStore, type JournalStore } from "./store";

const OWNER: JournalOwner = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  membershipId: "33333333-3333-4333-8333-333333333333",
};
const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const receive = (quantity: number): JournalPayload =>
  normalizeReceivePayload({ variantId: VARIANT, inventoryLocationId: LOCATION, quantity });

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

/**
 * A store whose writes resolve on a later microtask AND that explodes if two writes are ever in flight
 * at once — which is exactly the lost-update window a per-instance mutex would allow but the shared
 * namespace coordinator must prevent.
 */
function overlapDetectingStore(): JournalStore {
  const backing = createMemoryJournalStore();
  let active = 0;
  return {
    read: () => backing.read(),
    write: async (document) => {
      active += 1;
      if (active > 1) throw new Error("concurrent whole-document write detected");
      await Promise.resolve();
      await backing.write(document);
      active -= 1;
    },
  };
}

afterEach(() => resetNamespaceCoordinators());

describe("cross-instance serialization over one namespace (P1-2)", () => {
  it("two DISTINCT journal instances share one effective lock (no overlapping writes)", async () => {
    const store = overlapDetectingStore();
    // Two instances model a screen unmounting with work in flight and remounting a fresh journal.
    const a = createInventoryJournal(store, OWNER, keyFactory("A1", "A2"));
    const b = createInventoryJournal(store, OWNER, keyFactory("B1", "B2"));
    await Promise.all([a.prepare(receive(2)), b.prepare(receive(3)), a.prepare(receive(4))]);
    // The overlap detector never fired, and every entry survived.
    expect(await a.findRecoverable()).toHaveLength(3);
  });

  it("a delayed recordAccepted from instance A cannot clobber instance B's newer command", async () => {
    const store = overlapDetectingStore();
    const a = createInventoryJournal(store, OWNER, keyFactory("KA"));
    const b = createInventoryJournal(store, OWNER, keyFactory("KB"));

    const ea = await a.prepare(receive(2));
    await a.markSent(ea.commandKey);
    const eb = await b.prepare(receive(3));

    // A settles its command while B marks its own sent — concurrently. Serialization keeps both.
    await Promise.all([a.recordAccepted(ea.commandKey, { ok: true }), b.markSent(eb.commandKey)]);

    expect(await a.get("KA")).toMatchObject({ status: "accepted" });
    expect(await b.get("KB")).toMatchObject({ status: "sent" });
    expect(await a.findRecoverable()).toHaveLength(2);
  });

  it("a recovery replay transition overlapping a fresh prepare loses no entry", async () => {
    const store = overlapDetectingStore();
    const recovery = createInventoryJournal(store, OWNER, keyFactory("KR"));
    const live = createInventoryJournal(store, OWNER, keyFactory("KL"));

    const pending = await recovery.prepare(receive(2)); // left unresolved, as after a restart

    await Promise.all([recovery.markSent(pending.commandKey), live.prepare(receive(5))]);

    expect(await recovery.findRecoverable()).toHaveLength(2);
    expect(await recovery.get("KR")).toMatchObject({ status: "sent" });
    expect(await live.get("KL")).toMatchObject({ status: "prepared" });
  });
});
