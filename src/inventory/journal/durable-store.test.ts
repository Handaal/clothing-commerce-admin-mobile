// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWebJournalStore, quarantineLegacyV1, readLegacyV1Unresolved } from "./durable-store";
import {
  JournalCorruptError,
  JournalStorageError,
  type JournalEntry,
  type JournalOwner,
} from "./model";

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OWNER: JournalOwner = { tenantId: TENANT, membershipId: MEMBER };
const KEY = `admin-mobile.inventory-journal.v2.${TENANT}.${MEMBER}`;
const V1_KEY = "admin-mobile.inventory-journal.v1";

function entry(commandKey: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    commandKey,
    tenantId: TENANT,
    actorMembershipId: MEMBER,
    operationType: "receive",
    payload: {
      type: "receive",
      variantId: "77777777-7777-4777-8777-777777777777",
      inventoryLocationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      quantity: 2,
    },
    payloadIdentity: "id",
    preparedAt: "2026-09-27T10:00:00.000Z",
    status: "sent",
    ...overrides,
  };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("web durable journal store", () => {
  it("returns an empty document before anything is written", async () => {
    const store = createWebJournalStore(OWNER);
    expect(await store.read()).toEqual({ version: 2, entries: [] });
  });

  it("persists across a simulated restart under an owner-namespaced key", async () => {
    const writer = createWebJournalStore(OWNER);
    await writer.write({ version: 2, entries: [entry("K1")] });
    expect(localStorage.getItem(KEY)).not.toBeNull();

    const reopened = createWebJournalStore(OWNER);
    const document = await reopened.read();
    expect(document.entries).toHaveLength(1);
    expect(document.entries[0]).toMatchObject({ commandKey: "K1", status: "sent" });
  });

  it("isolates journals by owner namespace (a different membership sees nothing)", async () => {
    await createWebJournalStore(OWNER).write({ version: 2, entries: [entry("K1")] });
    const otherMember = createWebJournalStore({ tenantId: TENANT, membershipId: "other-member" });
    expect((await otherMember.read()).entries).toHaveLength(0);
  });

  it("FAILS CLOSED on corrupt JSON — it never becomes an empty document, and preserves evidence (P1-2)", async () => {
    localStorage.setItem(KEY, "{not valid json");
    const store = createWebJournalStore(OWNER);
    await expect(store.read()).rejects.toBeInstanceOf(JournalCorruptError);
    // The corrupt bytes are preserved (main key intact + quarantine copy) — evidence is never discarded.
    expect(localStorage.getItem(KEY)).toBe("{not valid json");
    expect(localStorage.getItem(`${KEY}.corrupt`)).toBe("{not valid json");
  });

  it("FAILS CLOSED on an unrecognized document shape (wrong version)", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, entries: [] }));
    await expect(createWebJournalStore(OWNER).read()).rejects.toBeInstanceOf(JournalCorruptError);
  });

  it("drops malformed entries but keeps well-formed ones", async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ version: 2, entries: [entry("K1"), { garbage: true }] }),
    );
    const document = await createWebJournalStore(OWNER).read();
    expect(document.entries).toHaveLength(1);
    expect(document.entries[0]?.commandKey).toBe("K1");
  });

  it("FAILS CLOSED when setItem throws (quota) — the write propagates (P1-2)", async () => {
    const store = createWebJournalStore(OWNER);
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    await expect(store.write({ version: 2, entries: [entry("K1")] })).rejects.toBeInstanceOf(
      JournalStorageError,
    );
    spy.mockRestore();
  });
});

describe("legacy V1 journal handling (P1 migration/quarantine)", () => {
  it("detects unresolved V1 entries for the tenant and never auto-claims them", async () => {
    // A released V1 doc (no membership) with one unresolved entry for this tenant.
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({
        version: 1,
        entries: [{ commandKey: "LEGACY1", tenantId: TENANT, status: "sent" }],
      }),
    );
    const legacy = await readLegacyV1Unresolved(OWNER);
    expect(legacy).toHaveLength(1);
    expect(legacy[0]?.commandKey).toBe("LEGACY1");

    // The V2 journal for the current owner is unaffected — the legacy entry was NOT migrated in.
    expect((await createWebJournalStore(OWNER).read()).entries).toHaveLength(0);
  });

  it("ignores resolved V1 entries and other tenants", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({
        version: 1,
        entries: [
          { commandKey: "DONE", tenantId: TENANT, status: "accepted" },
          { commandKey: "OTHER", tenantId: "other-tenant", status: "sent" },
        ],
      }),
    );
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(0);
  });

  it("quarantines the V1 journal by preserving it under an archive key and clearing the live key", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({
        version: 1,
        entries: [{ commandKey: "L", tenantId: TENANT, status: "sent" }],
      }),
    );
    await quarantineLegacyV1();
    expect(localStorage.getItem(V1_KEY)).toBeNull(); // no longer blocks
    expect(localStorage.getItem(`${V1_KEY}.quarantined`)).not.toBeNull(); // preserved, not deleted
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(0);
  });
});
