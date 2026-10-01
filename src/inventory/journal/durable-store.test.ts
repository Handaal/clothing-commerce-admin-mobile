// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installWebLocks, removeWebLocks } from "../../test-support/web-locks";
import { createWebJournalStore, quarantineLegacyV1, readLegacyV1Unresolved } from "./durable-store";
import {
  CrossContextLockUnavailableError,
  JournalCorruptError,
  JournalGenerationExhaustedError,
  JournalStorageError,
  normalizeReceivePayload,
  payloadIdentity,
  type JournalEntry,
  type JournalOwner,
} from "./model";
import { serializePersisted } from "./validation";

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const OWNER: JournalOwner = { tenantId: TENANT, membershipId: MEMBER };
const KEY = `admin-mobile.inventory-journal.v2.${TENANT}.${MEMBER}`;
const V1_KEY = "admin-mobile.inventory-journal.v1";
const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function entry(commandKey: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  const payload = normalizeReceivePayload({
    variantId: VARIANT,
    inventoryLocationId: LOCATION,
    quantity: 2,
  });
  return {
    commandKey,
    tenantId: TENANT,
    actorMembershipId: MEMBER,
    operationType: "receive",
    payload,
    payloadIdentity: payloadIdentity(payload),
    preparedAt: "2026-09-27T10:00:00.000Z",
    status: "sent",
    ...overrides,
  };
}

/** Write a persisted V2 document directly to localStorage (with a valid generation). */
function seed(entries: JournalEntry[], generation = 1) {
  localStorage.setItem(KEY, serializePersisted(entries, generation));
}

// Default to a supported browser (Web Locks present) so quarantine's mutation guard allows it; the
// no-Web-Locks fail-closed path is exercised explicitly below with removeWebLocks().
beforeEach(() => installWebLocks());
afterEach(() => {
  removeWebLocks();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("web durable journal store", () => {
  it("returns an empty document before anything is written", async () => {
    expect(await createWebJournalStore(OWNER).read()).toEqual({ version: 2, entries: [] });
  });

  it("persists across a simulated restart under an owner-namespaced key", async () => {
    const writer = createWebJournalStore(OWNER);
    await writer.write({ version: 2, entries: [entry("K1")] });
    expect(localStorage.getItem(KEY)).not.toBeNull();

    const document = await createWebJournalStore(OWNER).read();
    expect(document.entries).toHaveLength(1);
    expect(document.entries[0]).toMatchObject({ commandKey: "K1", status: "sent" });
  });

  it("isolates journals by owner namespace (a different membership sees nothing)", async () => {
    await createWebJournalStore(OWNER).write({ version: 2, entries: [entry("K1")] });
    const otherMember = createWebJournalStore({ tenantId: TENANT, membershipId: "other-member" });
    expect((await otherMember.read()).entries).toHaveLength(0);
  });

  it("FAILS CLOSED on corrupt JSON — never empty — and preserves evidence (P1-2/3)", async () => {
    localStorage.setItem(KEY, "{not valid json");
    const store = createWebJournalStore(OWNER);
    await expect(store.read()).rejects.toBeInstanceOf(JournalCorruptError);
    expect(localStorage.getItem(KEY)).toBe("{not valid json");
    expect(localStorage.getItem(`${KEY}.corrupt`)).toBe("{not valid json");
  });

  it("FAILS CLOSED on an unrecognized document shape (wrong version)", async () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, generation: 1, entries: [] }));
    await expect(createWebJournalStore(OWNER).read()).rejects.toBeInstanceOf(JournalCorruptError);
  });

  it("treats ANY invalid entry as whole-document corruption (never silently drops) (P1-3)", async () => {
    seed([entry("K1"), { garbage: true } as unknown as JournalEntry]);
    await expect(createWebJournalStore(OWNER).read()).rejects.toBeInstanceOf(JournalCorruptError);
    // Evidence preserved — not overwritten with a filtered/empty doc.
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("FAILS CLOSED when setItem throws (quota) — the write propagates (P1-2)", async () => {
    const store = createWebJournalStore(OWNER);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    await expect(store.write({ version: 2, entries: [entry("K1")] })).rejects.toBeInstanceOf(
      JournalStorageError,
    );
  });

  it("increments a monotonic generation on each write", async () => {
    const store = createWebJournalStore(OWNER);
    await store.write({ version: 2, entries: [entry("K1")] });
    const first = JSON.parse(localStorage.getItem(KEY) as string).generation;
    await store.write({ version: 2, entries: [entry("K1")] });
    const second = JSON.parse(localStorage.getItem(KEY) as string).generation;
    expect(second).toBe(first + 1);
  });

  it("FAILS CLOSED on a foreign MEMBERSHIP in the stored document (P1-4)", async () => {
    seed([entry("K1", { actorMembershipId: "99999999-9999-4999-8999-999999999999" })]);
    await expect(createWebJournalStore(OWNER).read()).rejects.toBeInstanceOf(JournalCorruptError);
    expect(localStorage.getItem(KEY)).not.toBeNull(); // evidence preserved, not filtered to empty
  });

  it("FAILS CLOSED on a foreign TENANT in the stored document (P1-4)", async () => {
    seed([entry("K1", { tenantId: "22222222-2222-4222-8222-222222222222" })]);
    await expect(createWebJournalStore(OWNER).read()).rejects.toBeInstanceOf(JournalCorruptError);
  });

  it("FAILS CLOSED (generation exhausted) rather than wrapping at MAX_SAFE_INTEGER (P1-2)", async () => {
    seed([entry("K1")], Number.MAX_SAFE_INTEGER);
    await expect(
      createWebJournalStore(OWNER).write({ version: 2, entries: [entry("K1")] }),
    ).rejects.toBeInstanceOf(JournalGenerationExhaustedError);
  });
});

describe("legacy V1 journal handling (P1-4 quarantine, blocks on all non-terminal evidence)", () => {
  const v1 = (status: string, tenantId = TENANT, commandKey = "L") =>
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({ version: 1, entries: [{ commandKey, tenantId, status }] }),
    );

  it("blocks on a V1 prepared entry", async () => {
    v1("prepared");
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks on a V1 sent entry", async () => {
    v1("sent");
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks on a V1 accepted entry (a committed, un-acknowledged legacy mutation) (P1-4)", async () => {
    v1("accepted");
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks on an unknown V1 status", async () => {
    v1("weird-unknown-state");
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks on a malformed V1 document (never interpreted as 'no journal')", async () => {
    localStorage.setItem(V1_KEY, "{not json");
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks on a malformed V1 entry", async () => {
    localStorage.setItem(V1_KEY, JSON.stringify({ version: 1, entries: [{ nope: true }] }));
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("ignores a V1 acknowledged entry and other tenants", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({
        version: 1,
        entries: [
          { commandKey: "DONE", tenantId: TENANT, status: "acknowledged" },
          { commandKey: "OTHER", tenantId: "other-tenant", status: "sent" },
        ],
      }),
    );
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(0);
  });

  it("returns nothing when there is no V1 journal", async () => {
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(0);
  });

  it("blocks on a MISSING version (P1-5)", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({ entries: [{ commandKey: "L", tenantId: TENANT, status: "acknowledged" }] }),
    );
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks on a WRONG version (P1-5)", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({
        version: 2,
        entries: [{ commandKey: "L", tenantId: TENANT, status: "acknowledged" }],
      }),
    );
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks on an empty tenant (P1-5)", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({ version: 1, entries: [{ commandKey: "L", tenantId: "", status: "sent" }] }),
    );
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks on an empty command key (P1-5)", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({
        version: 1,
        entries: [{ commandKey: "", tenantId: TENANT, status: "sent" }],
      }),
    );
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks on a non-string (malformed) status (P1-5)", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({ version: 1, entries: [{ commandKey: "L", tenantId: TENANT, status: 7 }] }),
    );
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("blocks when a malformed entry sits among otherwise-safe entries (P1-5)", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({
        version: 1,
        entries: [{ commandKey: "OK", tenantId: TENANT, status: "acknowledged" }, { nope: true }],
      }),
    );
    expect((await readLegacyV1Unresolved(OWNER)).length).toBeGreaterThan(0);
  });

  it("blocks when getItem itself throws (never assumes 'no journal') (P1-5)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("quarantines by preserving the V1 doc under an archive key and clearing the live key", async () => {
    v1("sent");
    await quarantineLegacyV1();
    expect(localStorage.getItem(V1_KEY)).toBeNull();
    expect(localStorage.getItem(`${V1_KEY}.quarantined`)).not.toBeNull();
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(0);
  });
});

describe("strict V1 validation precedes tenant routing (P1-2 / F10)", () => {
  const v1entry = (entry: Record<string, unknown>) =>
    localStorage.setItem(V1_KEY, JSON.stringify({ version: 1, entries: [entry] }));

  it("1. blocks a whitespace-only tenantId (trimmed emptiness, not routed away)", async () => {
    v1entry({ commandKey: "L", tenantId: "   ", status: "sent" });
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("2. blocks a whitespace-only commandKey", async () => {
    v1entry({ commandKey: "   ", tenantId: TENANT, status: "sent" });
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("3. blocks a whitespace-only status", async () => {
    v1entry({ commandKey: "L", tenantId: TENANT, status: "   " });
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("4. blocks an unknown status for the CURRENT tenant", async () => {
    v1entry({ commandKey: "L", tenantId: TENANT, status: "quantum" });
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("5. blocks an unknown status even when it claims a FOREIGN tenant", async () => {
    v1entry({ commandKey: "L", tenantId: "some-other-tenant", status: "quantum" });
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("6. blocks a malformed entry even when it claims a FOREIGN tenant", async () => {
    v1entry({ tenantId: "some-other-tenant" }); // no key, no status
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("7. blocks on a wrong/missing version regardless of entry contents", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({ entries: [{ commandKey: "L", tenantId: TENANT, status: "acknowledged" }] }),
    );
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(1);
  });

  it("8. a current-tenant acknowledged-only V1 is safe (frozen terminal state)", async () => {
    v1entry({ commandKey: "L", tenantId: TENANT, status: "acknowledged" });
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(0);
  });

  it("9. a well-formed FOREIGN-tenant acknowledged entry is ignored", async () => {
    v1entry({ commandKey: "L", tenantId: "some-other-tenant", status: "acknowledged" });
    expect(await readLegacyV1Unresolved(OWNER)).toHaveLength(0);
  });

  it("10. a mix with any malformed/unknown evidence never yields an empty blocking set", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({
        version: 1,
        entries: [
          { commandKey: "OK", tenantId: "some-other-tenant", status: "acknowledged" },
          { commandKey: "BAD", tenantId: "some-other-tenant", status: "quantum" },
        ],
      }),
    );
    expect((await readLegacyV1Unresolved(OWNER)).length).toBeGreaterThan(0);
  });
});

describe("legacy archive is fail-closed without Web Locks (P1-1 / F10)", () => {
  it("quarantineLegacyV1 REJECTS on web without Web Locks and leaves the live journal intact", async () => {
    localStorage.setItem(
      V1_KEY,
      JSON.stringify({
        version: 1,
        entries: [{ commandKey: "L", tenantId: TENANT, status: "sent" }],
      }),
    );
    removeWebLocks(); // simulate an unsupported browser
    await expect(quarantineLegacyV1()).rejects.toBeInstanceOf(CrossContextLockUnavailableError);
    // No mutation occurred: the live V1 key is untouched and nothing was archived.
    expect(localStorage.getItem(V1_KEY)).not.toBeNull();
    expect(localStorage.getItem(`${V1_KEY}.quarantined`)).toBeNull();
  });
});
