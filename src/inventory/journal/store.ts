import { emptyJournalDocument, type JournalDocument } from "./model";

/**
 * The persistence seam for the inventory mutation journal. Unlike the tenant-selection hint, this store
 * IS authoritative for in-flight command identity: it must durably survive an app/process restart so a
 * command whose response was lost can be recovered. Implementations read and write the whole document
 * (the unresolved set is tiny), which keeps every mutation a single atomic replace.
 */
export interface JournalStore {
  read(): Promise<JournalDocument>;
  write(document: JournalDocument): Promise<void>;
}

/**
 * In-memory store. Used by tests and as a safe fallback where no durable backend exists. A single
 * backing reference can be shared to SIMULATE a restart: recreate the journal over the same store and
 * the entries are still there (see the journal tests). It never persists across a real process restart.
 */
export function createMemoryJournalStore(initial?: JournalDocument): JournalStore {
  let document: JournalDocument = initial ?? emptyJournalDocument();
  return {
    read: async () => clone(document),
    write: async (next) => {
      document = clone(next);
    },
  };
}

/** Defensive deep clone so callers can never mutate stored state through a returned reference. */
function clone(document: JournalDocument): JournalDocument {
  return {
    version: document.version,
    entries: document.entries.map((entry) => ({ ...entry, payload: { ...entry.payload } })),
  };
}
