import type { IdempotencyKeyFactory } from "../idempotency";
import {
  isUnresolved,
  JournalConflictError,
  payloadIdentity,
  type JournalEntry,
  type JournalPayload,
} from "./model";
import type { JournalStore } from "./store";

/**
 * The durable command journal for high-risk inventory mutations. It owns idempotency-key identity: a
 * key is minted once, at {@link prepare}, and persisted BEFORE any transport, so a lost response never
 * costs us the key. Every method is a read-modify-write over the whole document; concurrent inventory
 * writes on one device are already serialized by the UI (one operation in flight at a time), so the
 * simple whole-document swap is sufficient and keeps each change atomic.
 */
export interface InventoryJournal {
  /**
   * Persist a command intent BEFORE transport and return its durable entry. If an equivalent command is
   * already unresolved for this tenant, that existing entry is returned (its key is REUSED) rather than
   * minting a new one — this is what prevents a lost-response command from being duplicated. The
   * returned entry is always in `prepared`.
   */
  prepare(tenantId: string, payload: JournalPayload): Promise<JournalEntry>;
  /** Move a prepared command to `sent` at the instant the request is dispatched. */
  markSent(commandKey: string): Promise<void>;
  /** Record a definitive server result and move the command to `accepted`. */
  recordAccepted(commandKey: string, result: unknown): Promise<void>;
  /**
   * Remove a command the server DEFINITIVELY rejected without applying (a validation/business
   * rejection). It mutated nothing, so there is nothing left to recover.
   */
  discard(commandKey: string): Promise<void>;
  /** Prune a resolved command once the operator has seen it (idempotent if already gone). */
  acknowledge(commandKey: string): Promise<void>;
  /**
   * Prune every already-resolved (`accepted`/`acknowledged`) command for a tenant. Called when the
   * Inventory surface loads so results left behind by a previous session — where the operator closed
   * the app on a success screen — do not accumulate. Unresolved commands are never touched.
   */
  pruneResolved(tenantId: string): Promise<void>;
  /** All still-unresolved commands for a tenant, oldest first. The recovery surface reads this. */
  findUnresolved(tenantId: string): Promise<JournalEntry[]>;
  /** The unresolved command equivalent to `payload` for this tenant, if any (same normalized identity). */
  findEquivalentUnresolved(tenantId: string, payload: JournalPayload): Promise<JournalEntry | null>;
  /** Look up one entry by its command key. */
  get(commandKey: string): Promise<JournalEntry | null>;
}

export function createInventoryJournal(
  store: JournalStore,
  generateKey: IdempotencyKeyFactory,
  now: () => string = () => new Date().toISOString(),
): InventoryJournal {
  async function mutate(change: (entries: JournalEntry[]) => JournalEntry[]): Promise<void> {
    const document = await store.read();
    await store.write({ version: 1, entries: change(document.entries) });
  }

  return {
    prepare: async (tenantId, payload) => {
      const identity = payloadIdentity(payload);
      const document = await store.read();
      const existing = document.entries.find(
        (entry) =>
          entry.tenantId === tenantId &&
          isUnresolved(entry.status) &&
          entry.operationType === payload.type &&
          entry.payloadIdentity === identity,
      );
      if (existing) return existing;

      const entry: JournalEntry = {
        commandKey: generateKey(),
        tenantId,
        operationType: payload.type,
        payload,
        payloadIdentity: identity,
        preparedAt: now(),
        status: "prepared",
      };
      // Guard the (theoretical) key collision so a fresh key can never overwrite a stored command.
      if (document.entries.some((e) => e.commandKey === entry.commandKey)) {
        throw new JournalConflictError(entry.commandKey);
      }
      await store.write({ version: 1, entries: [...document.entries, entry] });
      return entry;
    },

    markSent: (commandKey) =>
      mutate((entries) =>
        entries.map((entry) =>
          entry.commandKey === commandKey && entry.status === "prepared"
            ? { ...entry, status: "sent" }
            : entry,
        ),
      ),

    recordAccepted: (commandKey, result) =>
      mutate((entries) =>
        entries.map((entry) =>
          entry.commandKey === commandKey ? { ...entry, status: "accepted", result } : entry,
        ),
      ),

    discard: (commandKey) =>
      mutate((entries) => entries.filter((entry) => entry.commandKey !== commandKey)),

    acknowledge: (commandKey) =>
      mutate((entries) => entries.filter((entry) => entry.commandKey !== commandKey)),

    pruneResolved: (tenantId) =>
      mutate((entries) =>
        entries.filter((entry) => entry.tenantId !== tenantId || isUnresolved(entry.status)),
      ),

    findUnresolved: async (tenantId) => {
      const document = await store.read();
      return document.entries
        .filter((entry) => entry.tenantId === tenantId && isUnresolved(entry.status))
        .sort((a, b) => a.preparedAt.localeCompare(b.preparedAt));
    },

    findEquivalentUnresolved: async (tenantId, payload) => {
      const identity = payloadIdentity(payload);
      const document = await store.read();
      return (
        document.entries.find(
          (entry) =>
            entry.tenantId === tenantId &&
            isUnresolved(entry.status) &&
            entry.operationType === payload.type &&
            entry.payloadIdentity === identity,
        ) ?? null
      );
    },

    get: async (commandKey) => {
      const document = await store.read();
      return document.entries.find((entry) => entry.commandKey === commandKey) ?? null;
    },
  };
}
