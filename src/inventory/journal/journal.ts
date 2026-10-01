import type { IdempotencyKeyFactory } from "../idempotency";
import {
  isOwnedBy,
  isRecoverable,
  isResolved,
  isUnresolved,
  JournalConflictError,
  JournalTransitionError,
  payloadIdentity,
  type JournalEntry,
  type JournalOwner,
  type JournalPayload,
  type JournalStatus,
} from "./model";
import type { JournalStore } from "./store";

/**
 * The durable command journal for high-risk inventory mutations. It owns idempotency-key identity: a
 * key is minted once, at {@link prepare}, and persisted BEFORE any transport, so a lost response never
 * costs us the key.
 *
 * A journal instance is bound to a single {@link JournalOwner} (tenant + acting membership) — the same
 * fingerprint the API scopes inventory idempotency to — so a command minted by one user can never be
 * seen or replayed by a different user on the same device/tenant.
 *
 * Every transition is a read-modify-write over the whole document, and ALL of them run through one
 * journal-wide mutex ({@link runExclusive}). This is essential: two overlapping forms (e.g. Receive and
 * Adjust) that each read the document, mutate their own entry, and write it back would otherwise clobber
 * each other and lose an entry — after which a mutation could be transported whose durable record had
 * vanished. Serializing every write eliminates that lost-update window on the shared storage instance.
 *
 * Transitions are also guarded by invariants: the target entry must exist, be owned by this journal, and
 * be in a status that permits the requested change. A transition against a missing/foreign/wrong-status
 * entry FAILS ({@link JournalTransitionError}) rather than silently continuing or recreating a key.
 */
export interface InventoryJournal {
  /**
   * Persist a command intent BEFORE transport and return its durable entry. If an equivalent command is
   * already unresolved for this owner, that existing entry is returned (its key is REUSED) rather than
   * minting a new one — this is what prevents a lost-response command from being duplicated. The
   * returned entry is always in `prepared`.
   */
  prepare(payload: JournalPayload): Promise<JournalEntry>;
  /** Move a prepared command to `sent` at the instant the request is dispatched (idempotent re-send). */
  markSent(commandKey: string): Promise<void>;
  /** Record a definitive server success and move the command to `accepted` (resolved, kept until ack). */
  recordAccepted(commandKey: string, result: unknown): Promise<void>;
  /**
   * Record a DEFINITIVE server rejection (validation/business/auth) that did not apply. The entry is
   * kept in `rejected` (resolved, not terminal) so the operator sees the outcome and dismisses it
   * deliberately — it is never silently deleted.
   */
  recordRejected(commandKey: string): Promise<void>;
  /**
   * Acknowledge a RESOLVED command (accepted/rejected) once the operator has seen it, pruning it.
   * Idempotent if the entry is already gone. Refuses to prune a still-unresolved command — an ambiguous
   * command can never be discarded merely to dismiss it (that would delete the only durable idempotency
   * identity for a command the server may already have committed).
   */
  acknowledge(commandKey: string): Promise<void>;
  /**
   * Every not-yet-acknowledged command for this owner, oldest first: unresolved commands that still need
   * completing AND resolved commands that still need acknowledging. This is the full recovery set that
   * survives a restart. (Nothing is auto-pruned on load; accepted results are kept until acknowledged.)
   */
  findRecoverable(): Promise<JournalEntry[]>;
  /** The unresolved command equivalent to `payload` for this owner, if any (same normalized identity). */
  findEquivalentUnresolved(payload: JournalPayload): Promise<JournalEntry | null>;
  /** Look up one entry by its command key (only within this owner's scope). */
  get(commandKey: string): Promise<JournalEntry | null>;
}

/** A minimal async mutex: chains work so only one critical section touches the store at a time. */
function createMutex(): <T>(work: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const run = tail.then(work, work);
    // Keep the chain alive regardless of individual outcomes; never let a rejection break serialization.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** Which current statuses permit each transition. A transition from any other status is an invariant error. */
const ALLOWED_FROM: Record<"markSent" | "recordAccepted" | "recordRejected", JournalStatus[]> = {
  // Re-sending an already-`sent` command is legitimate (recovery replay), so `sent` is allowed too.
  markSent: ["prepared", "sent"],
  recordAccepted: ["prepared", "sent"],
  recordRejected: ["prepared", "sent"],
};

export function createInventoryJournal(
  store: JournalStore,
  owner: JournalOwner,
  generateKey: IdempotencyKeyFactory,
  now: () => string = () => new Date().toISOString(),
): InventoryJournal {
  const runExclusive = createMutex();

  /** Locate an owned entry by key, or throw a transition error if it is missing or foreign. */
  function requireOwned(entries: JournalEntry[], commandKey: string): JournalEntry {
    const entry = entries.find((e) => e.commandKey === commandKey);
    if (!entry) {
      throw new JournalTransitionError(commandKey, "The journal entry no longer exists.");
    }
    if (!isOwnedBy(entry, owner)) {
      throw new JournalTransitionError(
        commandKey,
        "The journal entry belongs to a different user.",
      );
    }
    return entry;
  }

  /** Apply a status transition to one owned entry, enforcing the allowed-from invariant. */
  function transition(
    kind: "markSent" | "recordAccepted" | "recordRejected",
    commandKey: string,
    to: JournalStatus,
    extra: Partial<JournalEntry> = {},
  ): Promise<void> {
    return runExclusive(async () => {
      const document = await store.read();
      const entry = requireOwned(document.entries, commandKey);
      if (!ALLOWED_FROM[kind].includes(entry.status)) {
        throw new JournalTransitionError(
          commandKey,
          `Cannot ${kind} a command in status "${entry.status}".`,
        );
      }
      const entries = document.entries.map((e) =>
        e.commandKey === commandKey ? { ...e, status: to, ...extra } : e,
      );
      await store.write({ version: 2, entries });
    });
  }

  return {
    prepare: (payload) =>
      runExclusive(async () => {
        const identity = payloadIdentity(payload);
        const document = await store.read();
        const existing = document.entries.find(
          (entry) =>
            isOwnedBy(entry, owner) &&
            isUnresolved(entry.status) &&
            entry.operationType === payload.type &&
            entry.payloadIdentity === identity,
        );
        if (existing) return existing;

        const entry: JournalEntry = {
          commandKey: generateKey(),
          tenantId: owner.tenantId,
          actorMembershipId: owner.membershipId,
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
        await store.write({ version: 2, entries: [...document.entries, entry] });
        return entry;
      }),

    markSent: (commandKey) => transition("markSent", commandKey, "sent"),

    recordAccepted: (commandKey, result) =>
      transition("recordAccepted", commandKey, "accepted", { result }),

    recordRejected: (commandKey) => transition("recordRejected", commandKey, "rejected"),

    acknowledge: (commandKey) =>
      runExclusive(async () => {
        const document = await store.read();
        const entry = document.entries.find((e) => e.commandKey === commandKey);
        if (!entry) return; // already pruned — idempotent
        if (!isOwnedBy(entry, owner)) {
          throw new JournalTransitionError(
            commandKey,
            "The journal entry belongs to a different user.",
          );
        }
        // Refuse to discard an ambiguous/unresolved command: its durable key is the only identity we
        // have for a mutation the server may already have committed. Only resolved entries are prunable.
        if (!isResolved(entry.status)) {
          throw new JournalTransitionError(
            commandKey,
            "An unresolved command cannot be discarded; it must be completed or reconciled first.",
          );
        }
        await store.write({
          version: 2,
          entries: document.entries.filter((e) => e.commandKey !== commandKey),
        });
      }),

    findRecoverable: () =>
      runExclusive(async () => {
        const document = await store.read();
        return document.entries
          .filter((entry) => isOwnedBy(entry, owner) && isRecoverable(entry.status))
          .sort((a, b) => a.preparedAt.localeCompare(b.preparedAt));
      }),

    findEquivalentUnresolved: (payload) =>
      runExclusive(async () => {
        const identity = payloadIdentity(payload);
        const document = await store.read();
        return (
          document.entries.find(
            (entry) =>
              isOwnedBy(entry, owner) &&
              isUnresolved(entry.status) &&
              entry.operationType === payload.type &&
              entry.payloadIdentity === identity,
          ) ?? null
        );
      }),

    get: (commandKey) =>
      runExclusive(async () => {
        const document = await store.read();
        const entry = document.entries.find((e) => e.commandKey === commandKey);
        return entry && isOwnedBy(entry, owner) ? entry : null;
      }),
  };
}
