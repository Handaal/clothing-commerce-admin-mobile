import { Platform } from "react-native";

import {
  emptyJournalDocument,
  isUnresolved,
  JournalCorruptError,
  JournalStorageError,
  type JournalDocument,
  type JournalEntry,
  type JournalOwner,
} from "./model";
import type { JournalStore } from "./store";

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

function nativeFileName(owner: JournalOwner): string {
  return `${NATIVE_PREFIX}.${owner.tenantId}.${owner.membershipId}.json`;
}

/**
 * Device-durable, membership-scoped journal storage. On web it uses `localStorage`; on native it uses a
 * JSON file in the persistent document directory, replaced crash-safely via a temp file. Both survive an
 * app/process restart, which is the property recovery depends on.
 *
 * This store FAILS CLOSED. A persistence failure (storage disabled, quota exceeded, a native write/read
 * error) throws {@link JournalStorageError}; corrupt stored content throws {@link JournalCorruptError}
 * and is preserved, never silently replaced with an empty document. It NEVER degrades to an in-memory
 * store — a high-risk inventory mutation must not be transported unless its durable prepare was secured.
 * The in-memory store ({@link createMemoryJournalStore}) remains available only for tests/explicit DI.
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
      return parseDocumentOrQuarantineWeb(store, key, raw);
    },
    write: async (document) => {
      const store = requireWebStorage();
      try {
        // Only update canonical durable state once the write succeeds; a throw propagates (fail closed).
        store.setItem(key, JSON.stringify(document));
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

/** Parse web content; on corruption, preserve the raw bytes under a quarantine key and fail closed. */
function parseDocumentOrQuarantineWeb(store: Storage, key: string, raw: string): JournalDocument {
  try {
    return parseDocument(raw);
  } catch (cause) {
    // Preserve the original bytes for recovery; keep the main key intact so reads keep blocking until
    // the journal is reconciled. Never overwrite the evidence with an empty document.
    try {
      const quarantineKey = `${key}.corrupt`;
      if (store.getItem(quarantineKey) === null) store.setItem(quarantineKey, raw);
    } catch {
      // Best-effort quarantine only; the primary guarantee is that we throw rather than return empty.
    }
    throw asCorruptError(cause);
  }
}

interface NativeFile {
  readonly exists: boolean;
  create(options: { overwrite: boolean }): void;
  write(contents: string): void;
  text(): string;
  delete(): void;
  copy(destination: NativeFile): Promise<void>;
  move(destination: NativeFile, options: { overwrite: boolean }): Promise<void>;
}

/**
 * Native: persist to a per-owner JSON file under the persistent document directory via expo-file-system.
 *
 * Crash-safe replacement. The current file is the only known-good copy and is NEVER truncated in place.
 * A write goes to a sibling `*.tmp`, which is fully written and then atomically renamed over the target.
 * Recovery rule on read: the main file is authoritative. If a write was interrupted before the rename,
 * the main file is still the last valid journal (untouched), and a stray `*.tmp` is incomplete and
 * discarded. A relaunch therefore always selects the last fully-written journal deterministically.
 */
export function createNativeJournalStore(owner: JournalOwner): JournalStore {
  const fileName = nativeFileName(owner);
  const tmpName = `${fileName}.tmp`;
  const corruptName = `${fileName}.corrupt`;

  const open = async (name: string): Promise<NativeFile> => {
    const { File, Paths } = await import("expo-file-system");
    return new File(Paths.document, name) as unknown as NativeFile;
  };

  return {
    read: async () => {
      let main: NativeFile;
      let tmp: NativeFile;
      try {
        main = await open(fileName);
        tmp = await open(tmpName);
      } catch (cause) {
        throw new JournalStorageError("Could not open the inventory recovery journal.", cause);
      }
      // A leftover temp means a prior replacement was interrupted; the main file is untouched and
      // authoritative, so the temp is incomplete and safe to discard.
      if (tmp.exists) {
        try {
          tmp.delete();
        } catch {
          // Non-fatal: the temp is ignored on read regardless.
        }
      }
      if (!main.exists) return emptyJournalDocument();
      let raw: string;
      try {
        raw = main.text();
      } catch (cause) {
        throw new JournalStorageError("Could not read the inventory recovery journal.", cause);
      }
      try {
        return parseDocument(raw);
      } catch (cause) {
        // Preserve the corrupt bytes beside the main file (copy, not move) so the main file stays in
        // place and keeps blocking until reconciled, while evidence is retained for recovery.
        try {
          const corrupt = await open(corruptName);
          if (!corrupt.exists) await main.copy(corrupt);
        } catch {
          // Best-effort quarantine only.
        }
        throw asCorruptError(cause);
      }
    },
    write: async (document) => {
      const serialized = JSON.stringify(document);
      try {
        const tmp = await open(tmpName);
        tmp.create({ overwrite: true });
        tmp.write(serialized);
        const main = await open(fileName);
        // Atomic rename over the target: the main file is replaced only after the temp is fully written.
        await tmp.move(main, { overwrite: true });
      } catch (cause) {
        throw new JournalStorageError("Could not save the inventory recovery journal.", cause);
      }
    },
  };
}

/**
 * Detect unresolved entries in the RELEASED V1 journal for this owner's tenant. V1 entries carry no
 * membership, so they cannot be safely attributed to the current membership; the caller surfaces them as
 * a quarantine that blocks new mutations until reconciled, and never replays them automatically. Returns
 * an empty array when there is no legacy journal or no unresolved legacy entries.
 */
export async function readLegacyV1Unresolved(owner: JournalOwner): Promise<JournalEntry[]> {
  const raw = await readLegacyV1Raw();
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A corrupt legacy journal is still "present"; represent it as a single opaque marker so the caller
    // treats the tenant as requiring reconciliation rather than silently ignoring it.
    return [legacyCorruptMarker(owner)];
  }
  const entries = Array.isArray((parsed as { entries?: unknown })?.entries)
    ? ((parsed as { entries: unknown[] }).entries.filter(isLegacyEntry) as JournalEntry[])
    : [];
  return entries.filter((entry) => entry.tenantId === owner.tenantId && isUnresolved(entry.status));
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
  const legacy = new File(Paths.document, V1_NATIVE_FILE) as unknown as NativeFile;
  if (!legacy.exists) return;
  const archive = new File(
    Paths.document,
    `${V1_NATIVE_FILE}.quarantined`,
  ) as unknown as NativeFile;
  await legacy.move(archive, { overwrite: true });
}

async function readLegacyV1Raw(): Promise<string | null> {
  if (Platform.OS === "web") {
    try {
      const store = requireWebStorage();
      return store.getItem(V1_WEB_KEY);
    } catch {
      return null;
    }
  }
  try {
    const { File, Paths } = await import("expo-file-system");
    const legacy = new File(Paths.document, V1_NATIVE_FILE) as unknown as NativeFile;
    return legacy.exists ? legacy.text() : null;
  } catch {
    return null;
  }
}

function legacyCorruptMarker(owner: JournalOwner): JournalEntry {
  return {
    commandKey: "legacy-v1-unreadable",
    tenantId: owner.tenantId,
    actorMembershipId: "",
    operationType: "receive",
    payload: { type: "receive", variantId: "", inventoryLocationId: "", quantity: 0 },
    payloadIdentity: "legacy-v1-unreadable",
    preparedAt: "1970-01-01T00:00:00.000Z",
    status: "sent",
  };
}

function isLegacyEntry(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.commandKey === "string" && typeof entry.tenantId === "string";
}

/**
 * Parse a persisted V2 document. Document-level corruption (unparseable JSON, wrong shape/version) THROWS
 * so the caller fails closed — it is never silently coerced to an empty journal. Entry-level malformation
 * is tolerated: unrecognized entries are dropped while well-formed entries (with their keys) are kept.
 */
function parseDocument(raw: string): JournalDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw asCorruptError(cause);
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { version?: unknown }).version !== 2 ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    throw new JournalCorruptError("The inventory recovery journal is not in a recognized format.");
  }
  const entries = (parsed as { entries: unknown[] }).entries.filter(isEntry);
  return { version: 2, entries };
}

function asCorruptError(cause: unknown): JournalCorruptError {
  return new JournalCorruptError("The inventory recovery journal is corrupt.", cause);
}

function isEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.commandKey === "string" &&
    typeof entry.tenantId === "string" &&
    typeof entry.actorMembershipId === "string" &&
    typeof entry.operationType === "string" &&
    typeof entry.payloadIdentity === "string" &&
    typeof entry.preparedAt === "string" &&
    typeof entry.status === "string" &&
    typeof entry.payload === "object" &&
    entry.payload !== null
  );
}
