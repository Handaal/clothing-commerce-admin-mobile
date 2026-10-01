import { describe, expect, it } from "vitest";

import { createGenerationStore, type GenerationFs } from "./durable-store";
import {
  JournalCorruptError,
  JournalStorageError,
  normalizeReceivePayload,
  payloadIdentity,
  type JournalDocument,
  type JournalEntry,
} from "./model";
import { serializePersisted } from "./validation";

const TENANT = "11111111-1111-4111-8111-111111111111";
const MEMBER = "33333333-3333-4333-8333-333333333333";
const VARIANT = "77777777-7777-4777-8777-777777777777";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = { tenantId: TENANT, membershipId: MEMBER };

const BASE = "inventory-journal.v2.j.json";
const MAIN = BASE;
const TEMP = `${BASE}.tmp`;
const BAK = `${BASE}.bak`;

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

/** A valid persisted copy at a given generation, holding one entry with the given key. */
function copy(commandKey: string, generation: number): string {
  return serializePersisted([entry(commandKey)], generation);
}

/**
 * How a simulated write fails — crucially, it can model a DANGEROUS failure that mutates the filesystem
 * before throwing (truncate to empty, write partial bytes, or delete the destination), not merely an
 * atomic "all or nothing" throw. This is what proves the ALGORITHM keeps a valid copy, not just a
 * forgiving adapter.
 */
type WriteFaultEffect = "none" | "truncate" | "partial" | "remove";

interface FakeFs extends GenerationFs {
  files: Map<string, string>;
  failWriteOf: (name: string | null, effect?: WriteFaultEffect) => void;
}

function fakeFs(initial: Record<string, string> = {}): FakeFs {
  const files = new Map(Object.entries(initial));
  let fault: { name: string; effect: WriteFaultEffect } | null = null;
  return {
    files,
    failWriteOf: (name, effect = "none") => {
      fault = name === null ? null : { name, effect };
    },
    read: async (name) => (files.has(name) ? (files.get(name) as string) : null),
    write: async (name, contents) => {
      if (fault && fault.name === name) {
        // Apply the dangerous side effect BEFORE throwing, exactly as a crash mid-write would.
        if (fault.effect === "truncate") files.set(name, "");
        else if (fault.effect === "partial")
          files.set(name, contents.slice(0, Math.max(1, Math.floor(contents.length / 2))));
        else if (fault.effect === "remove") files.delete(name);
        throw new Error(`simulated write failure: ${name} (${fault.effect})`);
      }
      files.set(name, contents);
    },
    remove: async (name) => {
      files.delete(name);
    },
  };
}

function store(fs: FakeFs) {
  return createGenerationStore(async () => fs, BASE, OWNER);
}

function keys(document: JournalDocument): string[] {
  return document.entries.map((e) => e.commandKey);
}

describe("native generation protocol — startup recovery", () => {
  it("1. main valid, temp absent → uses main", async () => {
    const fs = fakeFs({ [MAIN]: copy("A", 1) });
    expect(keys(await store(fs).read())).toEqual(["A"]);
  });

  it("2. main valid + stale (older) temp → keeps main, and read never deletes temp", async () => {
    const fs = fakeFs({ [MAIN]: copy("NEW", 5), [TEMP]: copy("OLD", 3) });
    expect(keys(await store(fs).read())).toEqual(["NEW"]);
    expect(fs.files.has(TEMP)).toBe(true); // read is non-destructive
  });

  it("3. main missing + temp valid → recovers temp", async () => {
    const fs = fakeFs({ [TEMP]: copy("T", 2) });
    expect(keys(await store(fs).read())).toEqual(["T"]);
  });

  it("4. main corrupt + temp valid → recovers temp", async () => {
    const fs = fakeFs({ [MAIN]: "{corrupt", [TEMP]: copy("T", 2) });
    expect(keys(await store(fs).read())).toEqual(["T"]);
  });

  it("5. main missing + backup valid → recovers backup", async () => {
    const fs = fakeFs({ [BAK]: copy("B", 4) });
    expect(keys(await store(fs).read())).toEqual(["B"]);
  });

  it("6. main corrupt + backup valid → recovers backup", async () => {
    const fs = fakeFs({ [MAIN]: "{corrupt", [BAK]: copy("B", 4) });
    expect(keys(await store(fs).read())).toEqual(["B"]);
  });

  it("7. temp corrupt + main valid → keeps main", async () => {
    const fs = fakeFs({ [MAIN]: copy("M", 3), [TEMP]: "{corrupt" });
    expect(keys(await store(fs).read())).toEqual(["M"]);
  });

  it("10. crash-equivalent (main removed, temp present) → recovers temp, never empty", async () => {
    const fs = fakeFs({ [TEMP]: copy("T", 9) });
    const document = await store(fs).read();
    expect(document.entries.length).toBeGreaterThan(0);
    expect(keys(document)).toEqual(["T"]);
  });

  it("11. multiple valid generations → selects the newest by generation (not slot)", async () => {
    const fs = fakeFs({ [MAIN]: copy("MAIN", 3), [TEMP]: copy("TEMP", 7), [BAK]: copy("BAK", 1) });
    expect(keys(await store(fs).read())).toEqual(["TEMP"]);
  });

  it("12. every surviving generation corrupt → throws (never empty) and preserves evidence", async () => {
    const fs = fakeFs({ [MAIN]: "{corrupt", [TEMP]: "also corrupt" });
    await expect(store(fs).read()).rejects.toBeInstanceOf(JournalCorruptError);
    expect(fs.files.has(`${BASE}.corrupt`)).toBe(true); // quarantined evidence
  });

  it("no files at all → genuinely empty", async () => {
    expect((await store(fakeFs()).read()).entries).toEqual([]);
  });
});

describe("native generation protocol — write", () => {
  it("promotes to main and cleans up temp/backup on success", async () => {
    const fs = fakeFs({ [MAIN]: copy("OLD", 1) });
    await store(fs).write({ version: 2, entries: [entry("NEW")] });
    expect(keys(await store(fs).read())).toEqual(["NEW"]);
    expect(fs.files.has(TEMP)).toBe(false);
    expect(fs.files.has(BAK)).toBe(false);
    // Generation advanced beyond the old copy.
    expect(JSON.parse(fs.files.get(MAIN) as string).generation).toBe(2);
  });

  it("8. promotion (main write) failure → a valid newer generation survives in temp", async () => {
    const fs = fakeFs({ [MAIN]: copy("OLD", 1) });
    fs.failWriteOf(MAIN);
    await expect(store(fs).write({ version: 2, entries: [entry("NEW")] })).rejects.toBeInstanceOf(
      JournalStorageError,
    );
    fs.failWriteOf(null);
    // Recovery still yields a valid journal — the new generation was safely staged in temp.
    const recovered = await store(fs).read();
    expect(recovered.entries.length).toBe(1);
    expect(keys(recovered)).toEqual(["NEW"]); // temp (gen 2) wins over old main (gen 1)
  });

  it("9. backup creation failure → fails closed, old main still intact", async () => {
    const fs = fakeFs({ [MAIN]: copy("OLD", 1) });
    fs.failWriteOf(BAK);
    await expect(store(fs).write({ version: 2, entries: [entry("NEW")] })).rejects.toBeInstanceOf(
      JournalStorageError,
    );
    fs.failWriteOf(null);
    // The staged temp (gen 2) survives; worst case old main (gen 1) does too — never empty.
    const recovered = await store(fs).read();
    expect(recovered.entries.length).toBe(1);
  });

  it("round-trips through read after write (no leftover generations)", async () => {
    const fs = fakeFs();
    const s = store(fs);
    await s.write({ version: 2, entries: [entry("A")] });
    await s.write({ version: 2, entries: [entry("A"), entry("B")] });
    expect(keys(await s.read())).toEqual(["A", "B"]);
    expect(fs.files.has(TEMP)).toBe(false);
    expect(fs.files.has(BAK)).toBe(false);
  });
});

describe("authoritative generation selection (P1-2 / P1-3a)", () => {
  it("equal highest generation with IDENTICAL contents → accepted (slot-priority tie-break)", async () => {
    const fs = fakeFs({ [MAIN]: copy("SAME", 5), [TEMP]: copy("SAME", 5) });
    expect(keys(await store(fs).read())).toEqual(["SAME"]);
  });

  it("equal highest generation with DIVERGENT contents → FAILS CLOSED (never arbitrary)", async () => {
    const fs = fakeFs({ [MAIN]: copy("A", 5), [TEMP]: copy("B", 5) });
    await expect(store(fs).read()).rejects.toBeInstanceOf(JournalCorruptError);
  });

  it("an absurd (1e308) temp generation cannot suppress a valid main", async () => {
    const absurd = JSON.stringify({ version: 2, generation: 1e308, entries: [entry("T")] });
    const fs = fakeFs({ [MAIN]: copy("M", 3), [TEMP]: absurd });
    expect(keys(await store(fs).read())).toEqual(["M"]);
  });
});

describe("expected-owner validation across native slots (P1-4)", () => {
  const foreignDoc = (key: string, generation: number) =>
    JSON.stringify({
      version: 2,
      generation,
      entries: [entry(key, { actorMembershipId: "99999999-9999-4999-8999-999999999999" })],
    });

  it("a foreign-owner slot is corrupt; a valid same-owner slot still wins", async () => {
    const fs = fakeFs({ [MAIN]: copy("M", 3), [TEMP]: foreignDoc("F", 9) });
    expect(keys(await store(fs).read())).toEqual(["M"]);
  });

  it("when every present slot is foreign-owner → throws (never empty)", async () => {
    const fs = fakeFs({ [MAIN]: foreignDoc("F", 9) });
    await expect(store(fs).read()).rejects.toBeInstanceOf(JournalCorruptError);
  });
});

/**
 * Deterministic fault-injection recovery. Each case puts authority in a specific slot, interrupts a
 * specific write with a DANGEROUS effect (truncate / partial / delete), and asserts that after a restart
 * at least ONE complete valid generation survives. This proves the authoritative-slot-aware algorithm,
 * not a forgiving adapter.
 */
describe("fault-injection interruption recovery (P1-1 / §2A)", () => {
  const NEW = { version: 2 as const, entries: [entry("NEW")] };

  it("1. temp-only authority → a clean next write recovers the new generation", async () => {
    const fs = fakeFs({ [TEMP]: copy("T", 2) });
    await store(fs).write(NEW);
    expect(keys(await store(fs).read())).toEqual(["NEW"]);
  });

  it("2. temp-only authority → two consecutive transitions never lose data", async () => {
    const fs = fakeFs({ [TEMP]: copy("T", 2) });
    const s = store(fs);
    await s.write({ version: 2, entries: [entry("A")] });
    await s.write({ version: 2, entries: [entry("A"), entry("B")] });
    expect(keys(await store(fs).read())).toEqual(["A", "B"]);
  });

  it("3. backup-only authority → next transition recovers the new generation", async () => {
    const fs = fakeFs({ [BAK]: copy("B", 4) });
    await store(fs).write(NEW);
    expect(keys(await store(fs).read())).toEqual(["NEW"]);
  });

  it("4. main-only authority → next transition recovers the new generation", async () => {
    const fs = fakeFs({ [MAIN]: copy("M", 1) });
    await store(fs).write(NEW);
    expect(keys(await store(fs).read())).toEqual(["NEW"]);
  });

  it("5. crash during staging write (temp truncated then throws) → old authority survives", async () => {
    const fs = fakeFs({ [MAIN]: copy("OLD", 1) });
    fs.failWriteOf(TEMP, "truncate");
    await expect(store(fs).write(NEW)).rejects.toBeInstanceOf(JournalStorageError);
    fs.failWriteOf(null);
    const recovered = await store(fs).read();
    expect(recovered.entries.length).toBeGreaterThan(0);
    expect(keys(recovered)).toEqual(["OLD"]); // main (gen 1) still valid
  });

  it("6. crash after staging validation (main truncated then throws) → new generation survives in temp", async () => {
    const fs = fakeFs({ [MAIN]: copy("OLD", 1) });
    fs.failWriteOf(MAIN, "truncate");
    await expect(store(fs).write(NEW)).rejects.toBeInstanceOf(JournalStorageError);
    fs.failWriteOf(null);
    const recovered = await store(fs).read();
    expect(recovered.entries.length).toBeGreaterThan(0);
    expect(keys(recovered)).toEqual(["NEW"]); // temp (gen 2) wins over surviving backup (gen 1)
  });

  it("7. crash while preserving authority (backup removed then throws) with TEMP-only authority → temp survives", async () => {
    // The critical P1-1 case: temp is the ONLY valid copy and the next write must not destroy it.
    const fs = fakeFs({ [TEMP]: copy("T", 2) });
    fs.failWriteOf(BAK, "remove");
    await expect(store(fs).write(NEW)).rejects.toBeInstanceOf(JournalStorageError);
    fs.failWriteOf(null);
    const recovered = await store(fs).read();
    expect(recovered.entries.length).toBeGreaterThan(0);
    expect(keys(recovered)).toEqual(["T"]); // temp authority was preserved, never overwritten first
  });

  it("8. crash while publishing new main (partial write) with MAIN-only authority → new generation survives", async () => {
    const fs = fakeFs({ [MAIN]: copy("OLD", 5) });
    fs.failWriteOf(MAIN, "partial");
    await expect(store(fs).write(NEW)).rejects.toBeInstanceOf(JournalStorageError);
    fs.failWriteOf(null);
    const recovered = await store(fs).read();
    expect(recovered.entries.length).toBeGreaterThan(0);
    expect(keys(recovered)).toEqual(["NEW"]); // temp (gen 6) + backup (gen 5) both valid; temp wins
  });

  it("temp-only authority: a staging overwrite that truncates temp still leaves the old copy in backup", async () => {
    // Authority is temp; step 1 copies it to backup; interrupt the step-2 temp overwrite.
    const fs = fakeFs({ [TEMP]: copy("T", 2) });
    fs.failWriteOf(TEMP, "truncate");
    await expect(store(fs).write(NEW)).rejects.toBeInstanceOf(JournalStorageError);
    fs.failWriteOf(null);
    const recovered = await store(fs).read();
    expect(recovered.entries.length).toBeGreaterThan(0);
    expect(keys(recovered)).toEqual(["T"]); // preserved in backup before temp was overwritten
  });

  it("generation exhaustion fails closed rather than wrapping", async () => {
    const fs = fakeFs({ [MAIN]: copy("M", Number.MAX_SAFE_INTEGER) });
    await expect(store(fs).write(NEW)).rejects.toMatchObject({
      name: "JournalGenerationExhaustedError",
    });
    // The pre-existing authoritative copy is untouched by the refused write.
    expect(keys(await store(fs).read())).toEqual(["M"]);
  });
});
