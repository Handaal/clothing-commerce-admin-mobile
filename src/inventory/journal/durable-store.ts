import { Platform } from "react-native";

import {
  emptyJournalDocument,
  JournalCorruptError,
  JournalStorageError,
  type JournalEntry,
  type JournalOwner,
} from "./model";
import type { JournalStore } from "./store";
import { parsePersisted, safeGeneration, serializePersisted } from "./validation";

// Durable storage is OWNERSHIP-AWARE: each (tenant, membership) pair gets its own namespace so one
// user's unresolved commands are never loaded into — or replayable by — another user on the same device,
// matching the API's actor-scoped inventory idempotency fingerprint. The `.v2` marker is a new format
// (membership-scoped); the released `.v1` journal lives at a separate, un-namespaced location and is
// never silently claimed (see {@link readLegacyV1Unresolved}).
const WEB_PREFIX = "admin-mobile.inventory-journal.v2";
const NATIVE_PREFIX = "inventory-journal.v2";

// The released V1 locations. V1 entries lack a membership owner, so they are detected/quarantined, never
// auto-adopted under whatever membership happens to be signed in.
const V1_WEB_KEY = "admin-mobile.inventory-journal.v1";
const V1_NATIVE_FILE = "inventory-journal.v1.json";

function webKey(owner: JournalOwner): string {
  return `${WEB_PREFIX}.${owner.tenantId}.${owner.membershipId}`;
}

function nativeBaseName(owner: JournalOwner): string {
  return `${NATIVE_PREFIX}.${owner.tenantId}.${owner.membershipId}.json`;
}

/**
 * Device-durable, membership-scoped journal storage. On web it uses `localStorage`; on native it uses a
 * crash-recoverable three-generation file protocol (see {@link createGenerationStore}). Both survive an
 * app/process restart, which is the property recovery depends on.
 *
 * This store FAILS CLOSED. A persistence failure (storage disabled, quota exceeded, a native I/O error)
 * throws {@link JournalStorageError}; corrupt stored content throws {@link JournalCorruptError} and is
 * preserved, never silently replaced with an empty document. It NEVER degrades to an in-memory store —
 * a high-risk inventory mutation must not be transported unless its durable prepare was secured. The
 * in-memory store ({@link createMemoryJournalStore}) remains available only for tests/explicit DI.
 */
export function createDurableJournalStore(owner: JournalOwner): JournalStore {
  if (Platform.OS === "web") {
    return createWebJournalStore(owner);
  }
  return createNativeJournalStore(owner);
}

/** Web: persist to a per-owner localStorage key. Reads fail closed; corrupt content is preserved. */
export function createWebJournalStore(owner: JournalOwner): JournalStore {
  const key = webKey(owner);
  return {
    read: async () => {
      const store = requireWebStorage();
      let raw: string | null;
      try {
        raw = store.getItem(key);
      } catch (cause) {
        throw new JournalStorageError("Could not read the inventory recovery journal.", cause);
      }
      if (raw === null) return emptyJournalDocument();
      try {
        return { version: 2, entries: parsePersisted(raw).entries };
      } catch (cause) {
        quarantineWeb(store, key, raw);
        throw cause instanceof JournalCorruptError ? cause : asCorrupt(cause);
      }
    },
    write: async (document) => {
      const store = requireWebStorage();
      let generation = 0;
      try {
        generation = safeGeneration(store.getItem(key)) + 1;
      } catch (cause) {
        throw new JournalStorageError("Could not read the inventory recovery journal.", cause);
      }
      try {
        store.setItem(key, serializePersisted(document.entries, generation));
      } catch (cause) {
        throw new JournalStorageError("Could not save the inventory recovery journal.", cause);
      }
    },
  };
}

/** Obtain localStorage or fail closed. A missing/disabled backend is a storage error, never a fallback. */
function requireWebStorage(): Storage {
  let store: Storage | null = null;
  try {
    store = typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
  } catch (cause) {
    throw new JournalStorageError("Local storage is unavailable.", cause);
  }
  if (!store) {
    throw new JournalStorageError("Local storage is unavailable.");
  }
  return store;
}

/** Preserve corrupt web bytes under a quarantine key; keep the main key intact so reads keep blocking. */
function quarantineWeb(store: Storage, key: string, raw: string): void {
  try {
    const quarantineKey = `${key}.corrupt`;
    if (store.getItem(quarantineKey) === null) store.setItem(quarantineKey, raw);
  } catch {
    // Best-effort quarantine only; the primary guarantee is that we throw rather than return empty.
  }
}

/**
 * The filesystem operations the native generation protocol needs, isolated behind an injectable seam so
 * the exact production algorithm can be tested in Node with a fake filesystem that models Expo semantics.
 */
export interface GenerationFs {
  /** File contents, or null when the file does not exist. Throws only on a genuine read error. */
  read(name: string): Promise<string | null>;
  /** Create/overwrite the file with the given contents. */
  write(name: string, contents: string): Promise<void>;
  /** Delete the file if it exists. */
  remove(name: string): Promise<void>;
}

/** Native file names for one owner: the live copy plus a backup and a temp used during replacement. */
interface GenerationNames {
  main: string;
  backup: string;
  temp: string;
  corrupt: string;
}

function generationNames(base: string): GenerationNames {
  return { main: base, backup: `${base}.bak`, temp: `${base}.tmp`, corrupt: `${base}.corrupt` };
}

/**
 * A crash-recoverable whole-document store over three physical generations — `main`, `backup`, `temp` —
 * each a complete, independently-validated copy tagged with a monotonic `generation`. It does NOT rely
 * on any single filesystem operation being atomic (in particular, an Expo overwrite-move deletes its
 * destination first, so a crash mid-move could erase the only copy). Instead it maintains the invariant
 * that **at every interruption point at least one complete, valid generation survives**:
 *
 * Write (new generation G = max existing valid generation + 1):
 *   1. write the full new content to `temp`; 2. validate `temp`;
 *   3. if `main` is currently valid, copy it to `backup` (a known-good older generation) BEFORE touching
 *      `main`; 4. write the new content over `main`; 5. validate `main`;
 *   6. only after `main` is confirmed valid, remove the now-stale `temp` and `backup`.
 *   A crash between 4 and 5 can leave `main` absent/partial, but `temp` (gen G) and `backup` (gen G-1)
 *   remain valid, so nothing is lost.
 *
 * Read (startup recovery): independently validate every surviving generation and return the one with the
 * highest generation (ties resolved by slot priority main > temp > backup). Reads NEVER delete anything —
 * in particular a stale `temp` is never removed before a valid generation is chosen. If files are present
 * but none is valid, the corrupt bytes are preserved and {@link JournalCorruptError} is thrown; if no
 * files exist at all, the journal is genuinely empty.
 */
export function createGenerationStore(
  getFs: () => Promise<GenerationFs>,
  base: string,
): JournalStore {
  const names = generationNames(base);
  const slots: [keyof GenerationNames, number][] = [
    ["main", 3],
    ["temp", 2],
    ["backup", 1],
  ];

  return {
    read: async () => {
      const fs = await getFs();
      let anyPresent = false;
      let corruptSample: string | null = null;
      const valid: { priority: number; generation: number; entries: JournalEntry[] }[] = [];

      for (const [slot, priority] of slots) {
        let raw: string | null;
        try {
          raw = await fs.read(names[slot]);
        } catch (cause) {
          throw new JournalStorageError("Could not read the inventory recovery journal.", cause);
        }
        if (raw === null) continue;
        anyPresent = true;
        try {
          const parsed = parsePersisted(raw);
          valid.push({ priority, generation: parsed.generation, entries: parsed.entries });
        } catch {
          if (slot === "main") corruptSample = raw;
          corruptSample ??= raw;
        }
      }

      if (!anyPresent) return emptyJournalDocument();
      if (valid.length === 0) {
        // Every surviving generation is corrupt: preserve evidence and fail closed (never empty).
        if (corruptSample !== null) {
          try {
            if ((await fs.read(names.corrupt)) === null)
              await fs.write(names.corrupt, corruptSample);
          } catch {
            // Best-effort quarantine only.
          }
        }
        throw new JournalCorruptError("Every inventory recovery journal generation is corrupt.");
      }

      valid.sort((a, b) => b.generation - a.generation || b.priority - a.priority);
      return { version: 2, entries: valid[0].entries };
    },

    write: async (document) => {
      const fs = await getFs();
      try {
        let maxGeneration = 0;
        for (const [slot] of slots) {
          maxGeneration = Math.max(maxGeneration, safeGeneration(await fs.read(names[slot])));
        }
        const content = serializePersisted(document.entries, maxGeneration + 1);

        // 1-2. Write and validate the new generation into temp (never touching main yet).
        await fs.write(names.temp, content);
        parsePersisted((await fs.read(names.temp)) ?? "");

        // 3. Preserve the current known-good main as a backup BEFORE main is disturbed.
        const mainRaw = await fs.read(names.main);
        if (mainRaw !== null && isValid(mainRaw)) {
          await fs.write(names.backup, mainRaw);
        }

        // 4-5. Promote into main and validate it.
        await fs.write(names.main, content);
        parsePersisted((await fs.read(names.main)) ?? "");

        // 6. Main is the newest valid copy — remove the now-stale temp/backup.
        await fs.remove(names.temp);
        await fs.remove(names.backup);
      } catch (cause) {
        throw new JournalStorageError("Could not save the inventory recovery journal.", cause);
      }
    },
  };
}

function isValid(raw: string): boolean {
  try {
    parsePersisted(raw);
    return true;
  } catch {
    return false;
  }
}

/** Native: the generation protocol over real Expo files in the persistent document directory. */
export function createNativeJournalStore(owner: JournalOwner): JournalStore {
  return createGenerationStore(expoGenerationFs, nativeBaseName(owner));
}

async function expoGenerationFs(): Promise<GenerationFs> {
  const { File, Paths } = await import("expo-file-system");
  type ExpoFile = {
    exists: boolean;
    create(options: { overwrite: boolean }): void;
    write(contents: string): void;
    textSync(): string;
    delete(): void;
  };
  const open = (name: string) => new File(Paths.document, name) as unknown as ExpoFile;
  return {
    read: async (name) => {
      const file = open(name);
      return file.exists ? file.textSync() : null;
    },
    write: async (name, contents) => {
      const file = open(name);
      file.create({ overwrite: true });
      file.write(contents);
    },
    remove: async (name) => {
      const file = open(name);
      if (file.exists) file.delete();
    },
  };
}

// ---------------------------------------------------------------------------------------------------
// Released V1 journal detection / quarantine
// ---------------------------------------------------------------------------------------------------

type LegacyRaw = { kind: "absent" } | { kind: "error" } | { kind: "present"; raw: string };

/**
 * Detect V1 journal evidence for this owner's tenant that is NOT provably safe to ignore. Because V1
 * entries carry no membership, they cannot be attributed to the current membership; the caller surfaces
 * any result as a quarantine that blocks new mutations until reconciled, and never replays them
 * automatically. A V1 journal that is present but unreadable/malformed, or that holds ANY non-terminal
 * entry for this tenant (`prepared`, `sent`, `accepted`, or an unknown status), BLOCKS — it is never
 * interpreted as "no legacy journal". Returns an empty array only when there is genuinely nothing unsafe.
 */
export async function readLegacyV1Unresolved(owner: JournalOwner): Promise<JournalEntry[]> {
  const legacy = await readLegacyV1Raw();
  if (legacy.kind === "absent") return [];
  if (legacy.kind === "error") return [legacyMarker(owner)]; // unreadable → block, never assume empty

  let parsed: unknown;
  try {
    parsed = JSON.parse(legacy.raw);
  } catch {
    return [legacyMarker(owner)]; // malformed → block
  }
  const entries = (parsed as { entries?: unknown })?.entries;
  if (!Array.isArray(entries)) return [legacyMarker(owner)]; // malformed shape → block

  const blocking: JournalEntry[] = [];
  for (const candidate of entries) {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      typeof (candidate as { status?: unknown }).status !== "string" ||
      typeof (candidate as { tenantId?: unknown }).tenantId !== "string"
    ) {
      blocking.push(legacyMarker(owner)); // a malformed entry is non-attributable → block
      continue;
    }
    const record = candidate as { status: string; tenantId: string; commandKey?: unknown };
    if (record.tenantId === owner.tenantId && record.status !== "acknowledged") {
      blocking.push(
        legacyMarker(owner, typeof record.commandKey === "string" ? record.commandKey : undefined),
      );
    }
  }
  return blocking;
}

/** Move the released V1 journal aside (preserving it) so it is deliberately quarantined, never deleted. */
export async function quarantineLegacyV1(): Promise<void> {
  if (Platform.OS === "web") {
    const store = requireWebStorage();
    const raw = store.getItem(V1_WEB_KEY);
    if (raw === null) return;
    const archiveKey = `${V1_WEB_KEY}.quarantined`;
    if (store.getItem(archiveKey) === null) store.setItem(archiveKey, raw);
    store.removeItem(V1_WEB_KEY);
    return;
  }
  const { File, Paths } = await import("expo-file-system");
  type ExpoFile = {
    exists: boolean;
    textSync(): string;
    create(o: { overwrite: boolean }): void;
    write(c: string): void;
    delete(): void;
  };
  const legacy = new File(Paths.document, V1_NATIVE_FILE) as unknown as ExpoFile;
  if (!legacy.exists) return;
  const archive = new File(Paths.document, `${V1_NATIVE_FILE}.quarantined`) as unknown as ExpoFile;
  const raw = legacy.textSync();
  archive.create({ overwrite: true });
  archive.write(raw);
  legacy.delete();
}

async function readLegacyV1Raw(): Promise<LegacyRaw> {
  if (Platform.OS === "web") {
    let store: Storage;
    try {
      store = requireWebStorage();
    } catch {
      return { kind: "error" }; // storage disabled while V1 may exist → block conservatively
    }
    const raw = store.getItem(V1_WEB_KEY);
    return raw === null ? { kind: "absent" } : { kind: "present", raw };
  }
  try {
    const { File, Paths } = await import("expo-file-system");
    type ExpoFile = { exists: boolean; textSync(): string };
    const legacy = new File(Paths.document, V1_NATIVE_FILE) as unknown as ExpoFile;
    if (!legacy.exists) return { kind: "absent" };
    return { kind: "present", raw: legacy.textSync() };
  } catch {
    return { kind: "error" };
  }
}

function legacyMarker(owner: JournalOwner, commandKey = "legacy-v1"): JournalEntry {
  return {
    commandKey,
    tenantId: owner.tenantId,
    actorMembershipId: "",
    operationType: "receive",
    payload: { type: "receive", variantId: "", inventoryLocationId: "", quantity: 0 },
    payloadIdentity: "legacy-v1",
    preparedAt: "1970-01-01T00:00:00.000Z",
    status: "sent",
  };
}

function asCorrupt(cause: unknown): JournalCorruptError {
  return new JournalCorruptError("The inventory recovery journal is corrupt.", cause);
}
