import {
  isResolved,
  isUnresolved,
  JournalCorruptError,
  JournalGenerationExhaustedError,
  payloadIdentity,
  type JournalEntry,
  type JournalOperationType,
  type JournalOwner,
  type JournalPayload,
  type JournalStatus,
} from "./model";

/**
 * The on-disk / on-storage shape of the journal. It carries a monotonic `generation` in addition to the
 * journal-facing `{ version, entries }` so the native generation protocol can deterministically pick the
 * newest complete copy among `main`/`temp`/`backup`, and so a half-written copy is never mistaken for the
 * latest. `generation` is a storage concern — the journal itself only ever sees `{ version, entries }`.
 */
export interface PersistedJournal {
  generation: number;
  entries: JournalEntry[];
}

/** Statuses that may legitimately appear in a PERSISTED document. `acknowledged` is deleted, never stored. */
const PERSISTED_STATUSES: readonly JournalStatus[] = ["prepared", "sent", "accepted", "rejected"];
const OPERATION_TYPES: readonly JournalOperationType[] = ["receive", "adjust", "transfer"];

export function serializePersisted(entries: JournalEntry[], generation: number): string {
  if (!isSafeGeneration(generation)) {
    // Guard the serializer too: a non-safe generation must never be written to disk/storage.
    throw new JournalGenerationExhaustedError(
      `Refusing to persist an unsafe generation ${String(generation)}.`,
    );
  }
  return JSON.stringify({ version: 2, generation, entries });
}

/** Best-effort generation read for computing the next generation; never throws (0 when unreadable). */
export function safeGeneration(raw: string | null): number {
  if (raw === null) return 0;
  try {
    return parsePersisted(raw).generation;
  } catch {
    return 0;
  }
}

/**
 * The next monotonic generation after `current`. Generations are SAFE integers only: once `current`
 * reaches {@link Number.MAX_SAFE_INTEGER} the counter is exhausted and we fail closed
 * ({@link JournalGenerationExhaustedError}) rather than wrap or silently reuse a generation — a reused
 * or wrapped generation could let a stale/partial copy outrank the authoritative one. `current` is
 * clamped at 0 for a fresh (empty) store.
 */
export function nextGeneration(current: number): number {
  const base = isSafeGeneration(current) ? current : 0;
  if (base >= Number.MAX_SAFE_INTEGER) {
    throw new JournalGenerationExhaustedError();
  }
  return base + 1;
}

/**
 * STRICT whole-document parse. Any structural OR semantic defect — a bad version/generation, a malformed
 * or impossible entry, a duplicate key, an entry owned by a DIFFERENT (tenant, membership) than the one
 * expected, or a payload whose recomputed identity does not match the stored one — makes the ENTIRE
 * document corrupt: we throw {@link JournalCorruptError} and never silently drop entries (silent dropping
 * would lose recovery evidence and could unblock a duplicate mutation). The original bytes are preserved
 * by the caller.
 *
 * When `expectedOwner` is supplied, EVERY persisted entry must belong to exactly that owner. A
 * foreign-owner entry (wrong tenant OR wrong membership) is corruption for this namespace — it is never
 * parsed-then-filtered, because a namespace whose document carries another owner's command is not a
 * trustworthy empty journal; it is a tampered/mis-scoped document and must fail closed.
 */
export function parsePersisted(raw: string, expectedOwner?: JournalOwner): PersistedJournal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new JournalCorruptError("The inventory recovery journal is not valid JSON.", cause);
  }
  if (!isRecord(parsed)) throw corrupt("document is not an object");
  if (parsed.version !== 2) throw corrupt("unrecognized journal version");
  if (!isSafeGeneration(parsed.generation)) throw corrupt("missing or invalid generation");
  if (!Array.isArray(parsed.entries)) throw corrupt("entries is not an array");

  const entries = parsed.entries.map((entry, index) => validateEntry(entry, index, expectedOwner));

  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(entry.commandKey)) throw corrupt(`duplicate command key "${entry.commandKey}"`);
    keys.add(entry.commandKey);
  }
  return { generation: parsed.generation, entries };
}

function validateEntry(value: unknown, index: number, expectedOwner?: JournalOwner): JournalEntry {
  if (!isRecord(value)) throw corrupt(`entry ${index} is not an object`);

  const {
    commandKey,
    tenantId,
    actorMembershipId,
    operationType,
    payloadIdentity: storedIdentity,
    preparedAt,
    status,
    result,
  } = value;

  if (!isNonEmptyString(commandKey)) throw corrupt(`entry ${index} has no command key`);
  if (!isNonEmptyString(tenantId)) throw corrupt(`entry ${commandKey} has no tenant`);
  if (!isNonEmptyString(actorMembershipId)) throw corrupt(`entry ${commandKey} has no membership`);
  // Expected-owner check: a persisted document is strictly single-owner. Any entry whose tenant OR
  // membership differs from the namespace's expected owner makes the whole document corrupt (never
  // filtered away to a misleading empty journal).
  if (expectedOwner !== undefined) {
    if (tenantId !== expectedOwner.tenantId) {
      throw corrupt(`entry ${commandKey} belongs to a different tenant`);
    }
    if (actorMembershipId !== expectedOwner.membershipId) {
      throw corrupt(`entry ${commandKey} belongs to a different membership`);
    }
  }
  if (!isOperationType(operationType)) throw corrupt(`entry ${commandKey} has invalid operation`);
  if (!isPersistedStatus(status))
    throw corrupt(`entry ${commandKey} has invalid status "${String(status)}"`);
  if (!isNonEmptyString(storedIdentity))
    throw corrupt(`entry ${commandKey} has no payload identity`);
  if (!isIsoTimestamp(preparedAt)) throw corrupt(`entry ${commandKey} has an invalid timestamp`);

  const payload = validatePayload(value.payload, operationType, commandKey);

  // Recompute the canonical identity from the stored payload and require it to match: a damaged payload
  // must never be replayed under a stale idempotency identity.
  if (payloadIdentity(payload) !== storedIdentity) {
    throw corrupt(`entry ${commandKey} payload identity does not match its payload`);
  }

  // Status/result invariants.
  if (isUnresolved(status) && result !== undefined) {
    throw corrupt(`entry ${commandKey} is ${status} but carries a result`);
  }
  if (status === "accepted" && result === undefined) {
    throw corrupt(`entry ${commandKey} is accepted but has no result`);
  }
  if (status === "rejected" && result !== undefined) {
    throw corrupt(`entry ${commandKey} is rejected but carries a result`);
  }

  const entry: JournalEntry = {
    commandKey,
    tenantId,
    actorMembershipId,
    operationType,
    payload,
    payloadIdentity: storedIdentity,
    preparedAt,
    status,
  };
  if (isResolved(status) && status === "accepted") entry.result = result;
  return entry;
}

function validatePayload(
  value: unknown,
  operationType: JournalOperationType,
  commandKey: string,
): JournalPayload {
  if (!isRecord(value)) throw corrupt(`entry ${commandKey} has no payload`);
  if (value.type !== operationType) {
    throw corrupt(`entry ${commandKey} payload type does not match its operation`);
  }
  if (!isNonEmptyString(value.variantId))
    throw corrupt(`entry ${commandKey} payload has no variant`);
  if (value.note !== undefined && typeof value.note !== "string") {
    throw corrupt(`entry ${commandKey} payload has an invalid note`);
  }

  switch (operationType) {
    case "receive": {
      if (!isNonEmptyString(value.inventoryLocationId)) {
        throw corrupt(`entry ${commandKey} receive payload has no location`);
      }
      if (!isPositiveInt(value.quantity)) {
        throw corrupt(`entry ${commandKey} receive payload has an invalid quantity`);
      }
      if (value.supplierId !== undefined && !isNonEmptyString(value.supplierId)) {
        throw corrupt(`entry ${commandKey} receive payload has an invalid supplier`);
      }
      // A supplier reference persists only when it carries meaningful text: `normalizeReceivePayload`
      // drops a blank/whitespace reference entirely, so a stored empty (or whitespace-only) reference is
      // not a shape the canonical normalizer would ever produce — it is corruption, not "no reference".
      if (value.supplierReference !== undefined) {
        if (typeof value.supplierReference !== "string" || value.supplierReference.trim() === "") {
          throw corrupt(`entry ${commandKey} receive payload has an invalid supplier reference`);
        }
      }
      return value as unknown as JournalPayload;
    }
    case "adjust": {
      if (!isNonEmptyString(value.inventoryLocationId)) {
        throw corrupt(`entry ${commandKey} adjust payload has no location`);
      }
      if (!isNonNegativeInt(value.countedQuantity)) {
        throw corrupt(`entry ${commandKey} adjust payload has an invalid counted quantity`);
      }
      if (!isNonNegativeInt(value.expectedVersion)) {
        throw corrupt(`entry ${commandKey} adjust payload has an invalid expected version`);
      }
      return value as unknown as JournalPayload;
    }
    case "transfer": {
      if (!isNonEmptyString(value.sourceInventoryLocationId)) {
        throw corrupt(`entry ${commandKey} transfer payload has no source`);
      }
      if (!isNonEmptyString(value.destinationInventoryLocationId)) {
        throw corrupt(`entry ${commandKey} transfer payload has no destination`);
      }
      if (!isPositiveInt(value.quantity)) {
        throw corrupt(`entry ${commandKey} transfer payload has an invalid quantity`);
      }
      return value as unknown as JournalPayload;
    }
  }
}

function corrupt(detail: string): JournalCorruptError {
  return new JournalCorruptError(`The inventory recovery journal is corrupt: ${detail}.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// Counts and versions are bounded integers: they must be SAFE integers, not merely integer-valued
// floats. `Number.isInteger(1e308)` is true but 1e308 is not a safe integer — it cannot be incremented
// or compared reliably — so such a value is rejected as corruption.
function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A storage generation must be a non-negative SAFE integer (never `1e308`, NaN, or fractional). */
function isSafeGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isOperationType(value: unknown): value is JournalOperationType {
  return typeof value === "string" && OPERATION_TYPES.includes(value as JournalOperationType);
}

function isPersistedStatus(value: unknown): value is JournalStatus {
  return typeof value === "string" && PERSISTED_STATUSES.includes(value as JournalStatus);
}
