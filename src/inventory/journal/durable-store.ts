import { Platform } from "react-native";

import { emptyJournalDocument, type JournalDocument, type JournalEntry } from "./model";
import { createMemoryJournalStore, type JournalStore } from "./store";

// A single, versioned location for the persisted journal. The name is stable across launches so a
// restart reads back exactly what the previous session wrote.
const STORAGE_KEY = "admin-mobile.inventory-journal.v1";
const FILE_NAME = "inventory-journal.v1.json";

/**
 * Device-durable journal storage. On web it uses `localStorage`; on native it uses a JSON file in the
 * persistent document directory. Both survive an app/process restart, which is the property the
 * recovery flow depends on. If the platform backend is genuinely unavailable it degrades to an
 * in-process store so the app never crashes — durability is lost only in that last-resort case.
 */
export function createDurableJournalStore(): JournalStore {
  if (Platform.OS === "web") {
    return createWebJournalStore();
  }
  return createNativeJournalStore();
}

/** Web (and Expo web): persist to localStorage. Recreating the store reads the same persisted value. */
export function createWebJournalStore(): JournalStore {
  const fallback = createMemoryJournalStore();
  const storage = (): Storage | null => {
    try {
      return typeof globalThis.localStorage !== "undefined" ? globalThis.localStorage : null;
    } catch {
      return null;
    }
  };
  return {
    read: async () => {
      const store = storage();
      if (!store) return fallback.read();
      try {
        const raw = store.getItem(STORAGE_KEY);
        return raw ? parseDocument(raw) : emptyJournalDocument();
      } catch {
        return emptyJournalDocument();
      }
    },
    write: async (document) => {
      const store = storage();
      if (!store) return fallback.write(document);
      try {
        store.setItem(STORAGE_KEY, JSON.stringify(document));
      } catch {
        await fallback.write(document);
      }
    },
  };
}

interface NativeFile {
  exists: boolean;
  create(options: { overwrite: boolean }): void;
  write(contents: string): void;
  text(): string;
}

/** Native: persist to a JSON file under the persistent document directory via expo-file-system. */
export function createNativeJournalStore(): JournalStore {
  const fallback = createMemoryJournalStore();
  const openFile = async (): Promise<NativeFile> => {
    const { File, Paths } = await import("expo-file-system");
    return new File(Paths.document, FILE_NAME) as unknown as NativeFile;
  };
  return {
    read: async () => {
      try {
        const file = await openFile();
        if (!file.exists) return emptyJournalDocument();
        return parseDocument(file.text());
      } catch {
        return fallback.read();
      }
    },
    write: async (document) => {
      try {
        const file = await openFile();
        file.create({ overwrite: true });
        file.write(JSON.stringify(document));
      } catch {
        await fallback.write(document);
      }
    },
  };
}

/**
 * Parse a persisted document defensively. Corrupt or unrecognized content yields an empty document
 * rather than throwing — a broken file must never brick the Inventory surface — but well-formed entries
 * are preserved verbatim, including their idempotency keys.
 */
function parseDocument(raw: string): JournalDocument {
  const parsed: unknown = JSON.parse(raw);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { version?: unknown }).version !== 1 ||
    !Array.isArray((parsed as { entries?: unknown }).entries)
  ) {
    return emptyJournalDocument();
  }
  const entries = (parsed as { entries: unknown[] }).entries.filter(isEntry);
  return { version: 1, entries };
}

function isEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.commandKey === "string" &&
    typeof entry.tenantId === "string" &&
    typeof entry.operationType === "string" &&
    typeof entry.payloadIdentity === "string" &&
    typeof entry.preparedAt === "string" &&
    typeof entry.status === "string" &&
    typeof entry.payload === "object" &&
    entry.payload !== null
  );
}
