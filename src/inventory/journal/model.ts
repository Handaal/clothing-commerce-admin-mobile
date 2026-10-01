import type { AdjustArgs, ReceiveArgs, TransferArgs } from "../operations";

/**
 * Durable identity for the high-risk, inventory-affecting write commands (receive — including a
 * supplier-linked receipt — adjust, and transfer). The whole point of the journal is that the
 * idempotency key and the exact normalized payload for an in-flight command survive an app restart or
 * a React remount, so a command whose response was lost is RECOVERED and replayed with its ORIGINAL
 * key (at-most-once at the API) rather than silently re-minted into a second, duplicate mutation.
 *
 * Only these four operations are journaled in this phase; ordinary read-only work and reversible
 * configuration are deliberately out of scope.
 */
export type JournalOperationType = "receive" | "adjust" | "transfer";

/** The exact, normalized command payload, tagged by operation. This is what gets replayed verbatim. */
export type ReceiveJournalPayload = { type: "receive" } & ReceiveArgs;
export type AdjustJournalPayload = { type: "adjust" } & AdjustArgs;
export type TransferJournalPayload = { type: "transfer" } & TransferArgs;
export type JournalPayload = ReceiveJournalPayload | AdjustJournalPayload | TransferJournalPayload;

/**
 * Lifecycle of a journaled command. A command is PERSISTED (`prepared`) before any transport, moved to
 * `sent` at the moment the request is dispatched, and only leaves the "unresolved" set once the server
 * outcome is known. Critically, a resolved command is NOT terminal: it stays visible until the operator
 * has explicitly ACKNOWLEDGED its result, so a crash between "server accepted" and "operator saw it"
 * can never lose the accepted state.
 *
 * - `prepared` — written to durable storage; transport not yet attempted (unresolved).
 * - `sent` — request dispatched; the outcome is unknown/ambiguous until it settles (unresolved).
 * - `accepted` — the server returned a definitive success (its canonical response is stored). Resolved,
 *   but NOT terminal: it survives a restart and stays visible until the operator acknowledges it.
 * - `rejected` — the server DEFINITIVELY refused the command without applying it (validation/business/
 *   auth). It did not mutate stock, but it is still kept (resolved, not terminal) so the operator sees
 *   the outcome and dismisses it deliberately — nothing silently vanishes.
 * - `acknowledged` — the operator has seen the resolved result; the entry may now be pruned. Terminal.
 *
 * The one-way transitions are: prepared → sent → (accepted | rejected) → acknowledged. `acknowledged`
 * is represented transiently just before an entry is deleted; a persisted document therefore only ever
 * holds prepared/sent/accepted/rejected entries.
 */
export type JournalStatus = "prepared" | "sent" | "accepted" | "rejected" | "acknowledged";

/** A command is "unresolved" while it may still have mutated (or be about to mutate) server state. */
export function isUnresolved(status: JournalStatus): boolean {
  return status === "prepared" || status === "sent";
}

/**
 * A command is "resolved" once the server outcome is known (`accepted` or `rejected`) but the operator
 * has not yet acknowledged it. Resolved entries are kept and surfaced for a deliberate acknowledgement.
 */
export function isResolved(status: JournalStatus): boolean {
  return status === "accepted" || status === "rejected";
}

/**
 * Everything the recovery surface must show: any entry not yet acknowledged, whether it is still
 * unresolved (needs completing) or resolved (needs acknowledging). This is what survives a restart.
 */
export function isRecoverable(status: JournalStatus): boolean {
  return isUnresolved(status) || isResolved(status);
}

/**
 * A stable identity for the authenticated actor a journaled command belongs to. This mirrors the API's
 * inventory idempotency fingerprint, which is scoped to the acting membership (not merely the tenant):
 * a command minted by one membership must never be seen or replayed by a different membership on the
 * same device/tenant, since the server would reject the replay under a different actor fingerprint.
 */
export interface JournalOwner {
  tenantId: string;
  /** The `/me/context` membership id of the acting user — the canonical actor fingerprint component. */
  membershipId: string;
}

/** True when an entry belongs to the given owner (both tenant AND acting membership must match). */
export function isOwnedBy(entry: JournalEntry, owner: JournalOwner): boolean {
  return entry.tenantId === owner.tenantId && entry.actorMembershipId === owner.membershipId;
}

export interface JournalEntry {
  /** The idempotency key. Durable command identity — reused verbatim on every replay. */
  commandKey: string;
  /** Tenant the command belongs to; entries are always filtered by this (cross-tenant safe). */
  tenantId: string;
  /** Acting membership the command belongs to; part of ownership so a different user cannot replay it. */
  actorMembershipId: string;
  operationType: JournalOperationType;
  /** The exact normalized payload, replayed byte-for-byte. */
  payload: JournalPayload;
  /** Canonical identity string of {@link payload}; used to detect an equivalent repeat / a conflict. */
  payloadIdentity: string;
  /** ISO-8601 instant the command was first prepared (before transport). */
  preparedAt: string;
  status: JournalStatus;
  /** The server's canonical response, present once the command is `accepted`. Opaque to the journal. */
  result?: unknown;
}

export interface JournalDocument {
  version: 2;
  entries: JournalEntry[];
}

export function emptyJournalDocument(): JournalDocument {
  return { version: 2, entries: [] };
}

/** Raised when a command key is reused with a payload that does not match the stored one. */
export class JournalConflictError extends Error {
  constructor(readonly commandKey: string) {
    super("The stored command for this key has a different payload.");
    this.name = "JournalConflictError";
  }
}

/**
 * Raised when durable persistence itself could not be secured (a `localStorage` quota/disabled error,
 * a native file write failure). High-risk mutations MUST fail closed on this: never transported, since
 * we could not durably record the command's identity first.
 */
export class JournalStorageError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "JournalStorageError";
  }
}

/**
 * Raised when the persisted journal content is present but unreadable/corrupt. We deliberately do NOT
 * treat this as an empty journal (that would silently discard recovery evidence and unblock mutations);
 * instead it blocks high-risk mutations until the journal is reconciled, and the raw bytes are preserved.
 */
export class JournalCorruptError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "JournalCorruptError";
  }
}

/**
 * Raised when a lifecycle transition cannot be applied safely: the target entry disappeared, its owner
 * does not match, or its current status does not permit the requested transition. The caller MUST fail
 * (never silently continue transport or recreate the entry under a new key).
 */
export class JournalTransitionError extends Error {
  constructor(
    readonly commandKey: string,
    message: string,
  ) {
    super(message);
    this.name = "JournalTransitionError";
  }
}

/** Trim an optional free-text field to a meaningful value, or drop it entirely when blank. */
function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Normalize command args into a canonical journal payload. Optional fields that are blank are dropped
 * so that "no note" and "note of spaces" are the same command. A `supplierReference` (document reference)
 * persists whenever it is provided, independent of `supplierId` — this matches the canonical API input,
 * which permits a reference without a supplier. Normalization is what makes {@link payloadIdentity} a
 * reliable equivalence key.
 */
export function normalizeReceivePayload(args: ReceiveArgs): ReceiveJournalPayload {
  const hasSupplier = typeof args.supplierId === "string" && args.supplierId.length > 0;
  return {
    type: "receive",
    variantId: args.variantId,
    inventoryLocationId: args.inventoryLocationId,
    quantity: args.quantity,
    ...(optionalText(args.note) ? { note: optionalText(args.note) } : {}),
    ...(hasSupplier ? { supplierId: args.supplierId } : {}),
    ...(optionalText(args.supplierReference)
      ? { supplierReference: optionalText(args.supplierReference) }
      : {}),
  };
}

export function normalizeAdjustPayload(args: AdjustArgs): AdjustJournalPayload {
  return {
    type: "adjust",
    variantId: args.variantId,
    inventoryLocationId: args.inventoryLocationId,
    countedQuantity: args.countedQuantity,
    expectedVersion: args.expectedVersion,
    ...(optionalText(args.note) ? { note: optionalText(args.note) } : {}),
  };
}

export function normalizeTransferPayload(args: TransferArgs): TransferJournalPayload {
  return {
    type: "transfer",
    variantId: args.variantId,
    sourceInventoryLocationId: args.sourceInventoryLocationId,
    destinationInventoryLocationId: args.destinationInventoryLocationId,
    quantity: args.quantity,
    ...(optionalText(args.note) ? { note: optionalText(args.note) } : {}),
  };
}

/**
 * A stable, canonical string identity for a payload: JSON with object keys sorted, so equivalent
 * commands (same fields, any key order) compare equal and a genuinely different command does not. Note
 * that `expectedVersion` is part of an adjust's identity: a recount against a new version is a NEW
 * command, never an equivalent repeat of the stale one.
 */
export function payloadIdentity(payload: JournalPayload): string {
  return stableStringify(payload);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
}
