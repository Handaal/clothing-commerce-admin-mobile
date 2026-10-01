import type { IdempotencyKeyFactory } from "../idempotency";
import { getNamespaceCoordinator, isCrossContextSafe, type RunExclusive } from "./coordinator";
import {
  CrossContextLockUnavailableError,
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
 * Every transition is a read-modify-write over the whole document, and ALL of them run through the
 * NAMESPACE coordinator ({@link getNamespaceCoordinator}) — a single lock shared by every journal
 * instance addressing the same (tenant, membership), including instances created across screen
 * remounts, and (on web) across browser tabs. This eliminates the lost-update window where two
 * overlapping writers clobber each other's whole-document write and lose an entry, after which a
 * mutation could be transported whose durable record had vanished.
 *
 * Transitions are also guarded by invariants: the target entry must exist, be owned by this journal, be
 * in a status that permits the requested change, and — when the caller supplies it — still carry the
 * expected payload identity. A transition that fails any check FAILS ({@link JournalTransitionError})
 * rather than silently continuing or recreating a key.
 */
export interface InventoryJournal {
  /**
   * Persist a command intent BEFORE transport and return its durable entry. If an equivalent command is
   * already unresolved for this owner, that existing entry is returned (its key is REUSED) rather than
   * minting a new one — this is what prevents a lost-response command from being duplicated. The
   * returned entry is always in `prepared`.
   */
  prepare(payload: JournalPayload): Promise<JournalEntry>;
  /** Move a prepared/sent command to `sent` at dispatch (idempotent re-send on recovery replay). */
  markSent(commandKey: string, expectedIdentity?: string): Promise<void>;
  /** Record a definitive server success and move a `sent` command to `accepted` (kept until ack). */
  recordAccepted(commandKey: string, result: unknown, expectedIdentity?: string): Promise<void>;
  /**
   * Record a DEFINITIVE server rejection (validation/business/auth) of a `sent` command that did not
   * apply. The entry is kept in `rejected` (resolved, not terminal) so the operator sees the outcome and
   * dismisses it deliberately — it is never silently deleted.
   */
  recordRejected(commandKey: string, expectedIdentity?: string): Promise<void>;
  /**
   * Acknowledge a RESOLVED command (accepted/rejected) once the operator has seen it, pruning it.
   * Idempotent if the entry is already gone. Refuses to prune a still-unresolved command — an ambiguous
   * command can never be discarded merely to dismiss it (that would delete the only durable idempotency
   * identity for a command the server may already have committed).
   */
  acknowledge(commandKey: string, expectedIdentity?: string): Promise<void>;
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

/**
 * Which current statuses permit each transition. The strict lifecycle is
 * `prepared → sent → (accepted | rejected)`: a result is only ever recorded for a command that was
 * actually dispatched (`sent`), never straight from `prepared`. `markSent` additionally tolerates a
 * `sent` source so a recovery replay can re-dispatch the same command idempotently.
 */
const ALLOWED_FROM: Record<"markSent" | "recordAccepted" | "recordRejected", JournalStatus[]> = {
  markSent: ["prepared", "sent"],
  recordAccepted: ["sent"],
  recordRejected: ["sent"],
};

export function createInventoryJournal(
  store: JournalStore,
  owner: JournalOwner,
  generateKey: IdempotencyKeyFactory,
  now: () => string = () => new Date().toISOString(),
  // Capability gate for high-risk MUTATIONS (injectable for tests). On web without the Web Locks API
  // this is false, and every mutating operation rejects BEFORE any persistent write — the fail-closed
  // guarantee is enforced here at the journal boundary, not left to UI visibility. Reads never consult it.
  crossContextSafe: () => boolean = isCrossContextSafe,
): InventoryJournal {
  const runExclusive: RunExclusive = getNamespaceCoordinator(owner);

  /** Refuse a high-risk mutation when cross-context write serialization is unavailable (fail closed). */
  function assertMutationAllowed(): void {
    if (!crossContextSafe()) {
      throw new CrossContextLockUnavailableError();
    }
  }

  /** Locate an owned entry by key, or throw a transition error if it is missing or foreign. */
  function requireOwned(
    entries: JournalEntry[],
    commandKey: string,
    expectedIdentity?: string,
  ): JournalEntry {
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
    if (expectedIdentity !== undefined && entry.payloadIdentity !== expectedIdentity) {
      throw new JournalTransitionError(
        commandKey,
        "The journal entry's payload identity has changed.",
      );
    }
    return entry;
  }

  /** Apply a status transition to one owned entry, enforcing the allowed-from and identity invariants. */
  function transition(
    kind: "markSent" | "recordAccepted" | "recordRejected",
    commandKey: string,
    to: JournalStatus,
    expectedIdentity: string | undefined,
    extra: Partial<JournalEntry> = {},
  ): Promise<void> {
    return runExclusive(async () => {
      assertMutationAllowed();
      const document = await store.read();
      const entry = requireOwned(document.entries, commandKey, expectedIdentity);
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
        assertMutationAllowed();
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

    markSent: (commandKey, expectedIdentity) =>
      transition("markSent", commandKey, "sent", expectedIdentity),

    recordAccepted: (commandKey, result, expectedIdentity) =>
      transition("recordAccepted", commandKey, "accepted", expectedIdentity, { result }),

    recordRejected: (commandKey, expectedIdentity) =>
      transition("recordRejected", commandKey, "rejected", expectedIdentity),

    acknowledge: (commandKey, expectedIdentity) =>
      runExclusive(async () => {
        assertMutationAllowed();
        const document = await store.read();
        const entry = document.entries.find((e) => e.commandKey === commandKey);
        if (!entry) return; // already pruned — idempotent
        if (!isOwnedBy(entry, owner)) {
          throw new JournalTransitionError(
            commandKey,
            "The journal entry belongs to a different user.",
          );
        }
        if (expectedIdentity !== undefined && entry.payloadIdentity !== expectedIdentity) {
          throw new JournalTransitionError(
            commandKey,
            "The journal entry's payload identity has changed.",
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
