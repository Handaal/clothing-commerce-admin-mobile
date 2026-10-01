import { afterEach, describe, expect, it } from "vitest";

import { resetNamespaceCoordinators } from "./coordinator";
import { createInventoryJournal } from "./journal";
import {
  CrossContextLockUnavailableError,
  normalizeReceivePayload,
  payloadIdentity,
  type JournalDocument,
  type JournalEntry,
  type JournalOwner,
} from "./model";
import { createMemoryJournalStore, type JournalStore } from "./store";

// Direct journal-boundary tests (no UI): on web without Web Locks the capability is unavailable, and
// EVERY high-risk mutation must reject BEFORE any persistent write. Reads must remain available. The
// capability is injected as `() => false` so the test does not depend on the runtime's navigator.

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OWNER: JournalOwner = { tenantId: TENANT, membershipId: MEMBER };
const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const PAYLOAD = normalizeReceivePayload({
  variantId: VARIANT,
  inventoryLocationId: LOCATION,
  quantity: 2,
});

function keyFactory(...keys: string[]) {
  let i = 0;
  return () => keys[i++] ?? `overflow-${i}`;
}

function entry(commandKey: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    commandKey,
    tenantId: TENANT,
    actorMembershipId: MEMBER,
    operationType: "receive",
    payload: PAYLOAD,
    payloadIdentity: payloadIdentity(PAYLOAD),
    preparedAt: "2026-09-27T10:00:00.000Z",
    status: "sent",
    ...overrides,
  };
}

/** A store that counts writes, so we can assert that a rejected mutation performed NO persistent write. */
function countingStore(initial: JournalDocument): { store: JournalStore; writes: () => number } {
  const backing = createMemoryJournalStore(initial);
  let writes = 0;
  return {
    writes: () => writes,
    store: {
      read: backing.read,
      write: async (document) => {
        writes += 1;
        await backing.write(document);
      },
    },
  };
}

const SEED: JournalDocument = {
  version: 2,
  entries: [
    entry("S", { status: "sent" }),
    entry("A", { status: "accepted", result: { ok: true } }),
  ],
};

afterEach(() => resetNamespaceCoordinators());

describe("journal fail-closed without cross-context locking (P1-1 / F10)", () => {
  function unsafeJournal(initial: JournalDocument = SEED) {
    const { store, writes } = countingStore(initial);
    const journal = createInventoryJournal(store, OWNER, keyFactory("NEW"), undefined, () => false);
    return { journal, writes };
  }

  it("prepare rejects and performs no persistent write", async () => {
    const { journal, writes } = unsafeJournal();
    await expect(journal.prepare(PAYLOAD)).rejects.toBeInstanceOf(CrossContextLockUnavailableError);
    expect(writes()).toBe(0);
  });

  it("markSent rejects and performs no persistent write", async () => {
    const { journal, writes } = unsafeJournal();
    await expect(journal.markSent("S")).rejects.toBeInstanceOf(CrossContextLockUnavailableError);
    expect(writes()).toBe(0);
  });

  it("recordAccepted rejects and performs no persistent write", async () => {
    const { journal, writes } = unsafeJournal();
    await expect(journal.recordAccepted("S", { ok: true })).rejects.toBeInstanceOf(
      CrossContextLockUnavailableError,
    );
    expect(writes()).toBe(0);
  });

  it("recordRejected rejects and performs no persistent write", async () => {
    const { journal, writes } = unsafeJournal();
    await expect(journal.recordRejected("S")).rejects.toBeInstanceOf(
      CrossContextLockUnavailableError,
    );
    expect(writes()).toBe(0);
  });

  it("acknowledge rejects (durable prune) and performs no persistent write", async () => {
    const { journal, writes } = unsafeJournal();
    await expect(journal.acknowledge("A")).rejects.toBeInstanceOf(CrossContextLockUnavailableError);
    expect(writes()).toBe(0);
  });

  it("READ operations remain available (list/get/find) — no capability check", async () => {
    const { journal, writes } = unsafeJournal();
    expect((await journal.findRecoverable()).map((e) => e.commandKey)).toEqual(["S", "A"]);
    expect(await journal.get("S")).toMatchObject({ commandKey: "S", status: "sent" });
    expect(await journal.findEquivalentUnresolved(PAYLOAD)).toMatchObject({ commandKey: "S" });
    expect(writes()).toBe(0); // reads never wrote
  });

  it("when cross-context locking IS available, the same mutations proceed", async () => {
    const { store, writes } = countingStore({ version: 2, entries: [] });
    const journal = createInventoryJournal(store, OWNER, keyFactory("K1"), undefined, () => true);
    const prepared = await journal.prepare(PAYLOAD);
    expect(prepared.commandKey).toBe("K1");
    await journal.markSent("K1");
    expect(writes()).toBeGreaterThan(0);
  });
});
