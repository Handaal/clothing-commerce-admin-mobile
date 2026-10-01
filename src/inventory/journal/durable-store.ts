import { Platform } from "react-native";

import {
  emptyJournalDocument,
  JournalCorruptError,
  JournalStorageError,
  type JournalEntry,
  type JournalOwner,
} from "./model";
import type { JournalStore } from "./store";
import { nextGeneration, parsePersisted, safeGeneration, serializePersisted } from "./validation";

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
        // Validate against the EXPECTED owner: a foreign-owner document for this key is corruption for
        // this namespace, never a silently-empty journal.
        return { version: 2, entries: parsePersisted(raw, owner).entries };
      } catch (cause) {
        quarantineWeb(store, key, raw);
        throw cause instanceof JournalCorruptError ? cause : asCorrupt(cause);
      }
    },
    write: async (document) => {
      const store = requireWebStorage();
      let current: number;
      try {
        current = safeGeneration(store.getItem(key));
      } catch (cause) {
        throw new JournalStorageError("Could not read the inventory recovery journal.", cause);
      }
      // Advance the monotonic generation with safe-integer / exhaustion guards (fail closed, never wrap).
      const serialized = serializePersisted(document.entries, nextGeneration(current));
      try {
        store.setItem(key, serialized);
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

/** One validated generation found in a slot during inspection. */
interface GenerationCandidate {
  slot: keyof GenerationNames;
  priority: number;
  generation: number;
  entries: JournalEntry[];
}

/**
 * A crash-recoverable whole-document store over three physical generations — `main`, `backup`, `temp` —
 * each a complete, independently-validated copy tagged with a monotonic `generation`. It does NOT rely
 * on any single filesystem operation being atomic (in particular, an Expo overwrite-move deletes its
 * destination first, and a write may truncate-then-fail, so a crash mid-operation could erase a copy).
 * Instead it maintains the invariant that **at every individual filesystem-operation boundary at least
 * one complete, valid generation survives**, regardless of which slot currently holds authority.
 *
 * Write is AUTHORITATIVE-SLOT-AWARE. Before anything is written it inspects and validates every slot and
 * identifies the authoritative (highest-generation) valid copy. It then:
 *   1. preserves the authoritative copy in `backup` BEFORE disturbing the slot that holds it (skipped
 *      when authority already is `backup`), so a known-good copy always exists off the staging/publish
 *      path — this is what stops a "temp is the only valid copy" situation from being destroyed by the
 *      next write;
 *   2. stages the new generation into `temp` and validates it;
 *   3. publishes the new generation into `main` and validates it;
 *   4. only then removes the now-stale `temp` and `backup`.
 * At step 3 both `temp` (= new generation) and `backup` (= old authority) are valid, so a crash that
 * truncates/partially-writes `main` loses nothing. If authority was `temp`, step 1 copied it into
 * `backup` first, so overwriting `temp` in step 2 cannot erase the only valid copy.
 *
 * Read (startup recovery): independently validate every surviving generation (against the expected
 * `owner`) and return the authoritative one — the highest generation, ties broken by slot priority
 * main > temp > backup. If two or more valid slots share the HIGHEST generation but their contents
 * DIVERGE, that is interrupted/corrupt persistence and we FAIL CLOSED ({@link JournalCorruptError})
 * rather than arbitrarily choosing one. Reads NEVER delete anything (a stale `temp` is never removed
 * before a valid generation is chosen). If files are present but none is valid, the corrupt bytes are
 * preserved and {@link JournalCorruptError} is thrown; if no files exist at all, the journal is empty.
 */
export function createGenerationStore(
  getFs: () => Promise<GenerationFs>,
  base: string,
  owner?: JournalOwner,
): JournalStore {
  const names = generationNames(base);
  const slots: [keyof GenerationNames, number][] = [
    ["main", 3],
    ["temp", 2],
    ["backup", 1],
  ];

  /** Read and validate every slot. Throws {@link JournalStorageError} only on a genuine FS read error. */
  async function inspect(fs: GenerationFs): Promise<{
    anyPresent: boolean;
    corruptSample: string | null;
    candidates: GenerationCandidate[];
  }> {
    let anyPresent = false;
    let corruptSample: string | null = null;
    const candidates: GenerationCandidate[] = [];
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
        const parsed = parsePersisted(raw, owner);
        candidates.push({ slot, priority, generation: parsed.generation, entries: parsed.entries });
      } catch {
        if (slot === "main") corruptSample = raw;
        corruptSample ??= raw;
      }
    }
    return { anyPresent, corruptSample, candidates };
  }

  return {
    read: async () => {
      const fs = await getFs();
      const { anyPresent, corruptSample, candidates } = await inspect(fs);

      if (!anyPresent) return emptyJournalDocument();
      if (candidates.length === 0) {
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

      // May throw JournalCorruptError if the highest generation is held by divergent copies.
      return { version: 2, entries: selectAuthoritative(candidates).entries };
    },

    write: async (document) => {
      const fs = await getFs();
      // Inspect BEFORE writing so staging is authoritative-slot-aware. A read I/O error surfaces as a
      // JournalStorageError here; a divergent equal-generation state surfaces as a JournalCorruptError
      // from selectAuthoritative — both fail closed and neither is wrapped/hidden below.
      const { candidates } = await inspect(fs);
      const authoritative = candidates.length > 0 ? selectAuthoritative(candidates) : null;
      // Advance the monotonic generation with safe-integer / exhaustion guards (fail closed, never wrap).
      const content = serializePersisted(
        document.entries,
        nextGeneration(authoritative?.generation ?? 0),
      );

      try {
        // 1. Preserve the current authority in `backup` BEFORE disturbing the slot that holds it (unless
        //    authority already IS backup). This keeps a known-good copy off the staging/publish path.
        if (authoritative && authoritative.slot !== "backup") {
          const authRaw = await fs.read(names[authoritative.slot]);
          if (authRaw !== null && isValid(authRaw, owner)) {
            await fs.write(names.backup, authRaw);
            assertReadback(await fs.read(names.backup), owner);
          }
        }

        // 2. Stage the new generation into `temp` and validate it (main/backup untouched so far).
        await fs.write(names.temp, content);
        assertReadback(await fs.read(names.temp), owner);

        // 3. Publish the new generation into `main` and validate it. Throughout this write `temp`
        //    (= new generation) and `backup` (= old authority) remain valid, so a crash loses nothing.
        await fs.write(names.main, content);
        assertReadback(await fs.read(names.main), owner);

        // 4. `main` is now the sole newest valid copy — remove the now-stale staging/backup copies.
        await fs.remove(names.temp);
        await fs.remove(names.backup);
      } catch (cause) {
        if (cause instanceof JournalStorageError) throw cause;
        throw new JournalStorageError("Could not save the inventory recovery journal.", cause);
      }
    },
  };
}

/**
 * Pick the authoritative generation: the highest generation, ties broken by slot priority. If the
 * highest generation is shared by two or more valid copies whose CONTENTS differ, that indicates
 * interrupted/corrupt persistence and we fail closed rather than arbitrarily preferring one slot.
 * Identical copies at the same generation (the benign aftermath of a crash between publish and cleanup)
 * are accepted and resolved deterministically by slot priority.
 */
function selectAuthoritative(candidates: GenerationCandidate[]): GenerationCandidate {
  const maxGeneration = candidates.reduce((max, c) => Math.max(max, c.generation), 0);
  const top = candidates.filter((c) => c.generation === maxGeneration);
  if (top.length > 1) {
    const canonical = JSON.stringify(top[0].entries);
    if (top.some((c) => JSON.stringify(c.entries) !== canonical)) {
      throw new JournalCorruptError(
        `Inventory recovery journal generation ${maxGeneration} is held by divergent copies.`,
      );
    }
  }
  return [...top].sort((a, b) => b.priority - a.priority)[0];
}

function isValid(raw: string, owner?: JournalOwner): boolean {
  try {
    parsePersisted(raw, owner);
    return true;
  } catch {
    return false;
  }
}

/** Validate a just-written copy that was read back; a bad read-back means the write did not persist. */
function assertReadback(raw: string | null, owner?: JournalOwner): void {
  if (raw === null) {
    throw new JournalStorageError("A journal copy could not be read back after writing.");
  }
  parsePersisted(raw, owner);
}

/** Native: the generation protocol over real Expo files in the persistent document directory. */
export function createNativeJournalStore(owner: JournalOwner): JournalStore {
  return createGenerationStore(expoGenerationFs, nativeBaseName(owner), owner);
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

/** V1 lifecycle statuses that are provably safe to ignore (the operator already saw the outcome). */
const V1_SAFE_STATUSES = new Set(["acknowledged"]);

/**
 * Detect V1 journal evidence for this owner's tenant that is NOT provably safe to ignore. Because V1
 * entries carry no membership, they cannot be attributed to the current membership; the caller surfaces
 * any result as a quarantine that blocks new mutations until reconciled, and never replays them
 * automatically.
 *
 * Parsing is STRICT. The document must be an object with the EXACT V1 `version` and an `entries` array;
 * anything else (unreadable, malformed JSON, missing/wrong version, wrong shape) is blocking evidence,
 * never "no legacy journal". Each entry is validated structurally (a non-empty string `commandKey`,
 * non-empty string `tenantId`, and a non-empty string `status`); a malformed/non-attributable entry
 * BLOCKS regardless of tenant. For a well-formed entry belonging to THIS tenant, only a provably safe
 * status (`acknowledged`) is non-blocking — every other status, including `prepared`/`sent`/`accepted`/
 * `rejected` and any unknown status, BLOCKS. Returns an empty array only when there is genuinely nothing
 * unsafe for this tenant.
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
  // STRICT shape + exact version. A V1 document missing/with the wrong version is unreadable evidence.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [legacyMarker(owner)];
  }
  if ((parsed as { version?: unknown }).version !== 1) return [legacyMarker(owner)];
  const entries = (parsed as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [legacyMarker(owner)]; // malformed shape → block

  const blocking: JournalEntry[] = [];
  for (const candidate of entries) {
    const marker = classifyLegacyV1Entry(candidate, owner);
    if (marker) blocking.push(marker);
  }
  return blocking;
}

/**
 * Classify one V1 entry: return a blocking marker if it is unsafe/non-attributable for this owner's
 * tenant, or `null` if it is provably safe to ignore. A structurally malformed entry (missing/empty
 * key, tenant, or status) can never be proven safe, so it blocks regardless of which tenant it claims.
 */
function classifyLegacyV1Entry(candidate: unknown, owner: JournalOwner): JournalEntry | null {
  if (typeof candidate !== "object" || candidate === null) return legacyMarker(owner);
  const record = candidate as { status?: unknown; tenantId?: unknown; commandKey?: unknown };
  const { status, tenantId, commandKey } = record;
  if (typeof status !== "string" || status === "") return legacyMarker(owner);
  if (typeof tenantId !== "string" || tenantId === "") return legacyMarker(owner);
  if (typeof commandKey !== "string" || commandKey === "") return legacyMarker(owner);

  // A well-formed entry for another tenant cannot affect this owner's tenant.
  if (tenantId !== owner.tenantId) return null;
  // For this tenant only a provably safe status is ignorable; everything else blocks.
  if (V1_SAFE_STATUSES.has(status)) return null;
  return legacyMarker(owner, commandKey);
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
    try {
      const store = requireWebStorage();
      const raw = store.getItem(V1_WEB_KEY);
      return raw === null ? { kind: "absent" } : { kind: "present", raw };
    } catch {
      // Storage disabled, or getItem threw, while a V1 journal may exist → block conservatively.
      return { kind: "error" };
    }
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
