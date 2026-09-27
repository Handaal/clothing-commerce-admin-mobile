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
 * outcome is known:
 *
 * - `prepared` — written to durable storage; transport not yet attempted (unresolved).
 * - `sent` — request dispatched; the outcome is unknown/ambiguous until it settles (unresolved).
 * - `accepted` — the server returned a definitive result (its canonical response is stored). Resolved.
 * - `acknowledged` — the operator has seen the resolved result; the entry may be pruned. Terminal.
 *
 * A command that the server DEFINITIVELY rejected without applying (a validation/business rejection) is
 * removed from the journal entirely — it did not mutate stock, so there is nothing to recover.
 */
export type JournalStatus = "prepared" | "sent" | "accepted" | "acknowledged";

/** A command is "unresolved" while it may still have mutated (or be about to mutate) server state. */
export function isUnresolved(status: JournalStatus): boolean {
  return status === "prepared" || status === "sent";
}

export interface JournalEntry {
  /** The idempotency key. Durable command identity — reused verbatim on every replay. */
  commandKey: string;
  /** Tenant/context the command belongs to; entries are always filtered by this (cross-tenant safe). */
  tenantId: string;
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
  version: 1;
  entries: JournalEntry[];
}

export function emptyJournalDocument(): JournalDocument {
  return { version: 1, entries: [] };
}

/** Raised when a command key is reused with a payload that does not match the stored one. */
export class JournalConflictError extends Error {
  constructor(readonly commandKey: string) {
    super("The stored command for this key has a different payload.");
    this.name = "JournalConflictError";
  }
}

/** Trim an optional free-text field to a meaningful value, or drop it entirely when blank. */
function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Normalize command args into a canonical journal payload. Optional fields that are blank are dropped
 * so that "no note" and "note of spaces" are the same command, and a supplier reference is only kept
 * alongside a supplier. Normalization is what makes {@link payloadIdentity} a reliable equivalence key.
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
    ...(hasSupplier && optionalText(args.supplierReference)
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
