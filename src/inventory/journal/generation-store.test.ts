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

const BASE = "inventory-journal.v2.j.json";
const MAIN = BASE;
const TEMP = `${BASE}.tmp`;
const BAK = `${BASE}.bak`;

function entry(commandKey: string): JournalEntry {
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
  };
}

/** A valid persisted copy at a given generation, holding one entry with the given key. */
function copy(commandKey: string, generation: number): string {
  return serializePersisted([entry(commandKey)], generation);
}

interface FakeFs extends GenerationFs {
  files: Map<string, string>;
  failWriteOf: (name: string | null) => void;
}

function fakeFs(initial: Record<string, string> = {}): FakeFs {
  const files = new Map(Object.entries(initial));
  let failWrite: string | null = null;
  return {
    files,
    failWriteOf: (name) => {
      failWrite = name;
    },
    read: async (name) => (files.has(name) ? (files.get(name) as string) : null),
    write: async (name, contents) => {
      if (failWrite === name) throw new Error(`simulated write failure: ${name}`);
      files.set(name, contents);
    },
    remove: async (name) => {
      files.delete(name);
    },
  };
}

function store(fs: FakeFs) {
  return createGenerationStore(async () => fs, BASE);
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
