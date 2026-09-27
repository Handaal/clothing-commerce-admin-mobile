import type {
  AdjustInventoryResponse,
  ReceiveInventoryResponse,
  TenantCommerceClient,
  TransferInventoryResponse,
} from "@shifted/clothing-commerce-sdk";

import { adjustStock, receiveStock, transferStock } from "../operations";
import type { JournalPayload } from "./model";

/** The subset of the SDK client the journal needs — the three high-risk inventory writes. */
export type JournaledInventoryClient = Pick<
  TenantCommerceClient,
  "receiveInventory" | "adjustInventory" | "transferInventory"
>;

export type JournaledCommandResult =
  ReceiveInventoryResponse | AdjustInventoryResponse | TransferInventoryResponse;

/**
 * Run a journaled command against the real SDK using its DURABLE idempotency key. This is the single
 * place that maps a stored payload back onto the exact SDK call — used identically by the live write
 * hook and by restart recovery, so a replayed command is byte-for-byte the original request. The `type`
 * discriminant is a journal-only field and is never forwarded to the SDK.
 */
export function runJournaledCommand(
  client: JournaledInventoryClient,
  payload: JournalPayload,
  idempotencyKey: string,
): Promise<JournaledCommandResult> {
  switch (payload.type) {
    case "receive":
      return receiveStock(client, withoutType(payload), idempotencyKey);
    case "adjust":
      return adjustStock(client, withoutType(payload), idempotencyKey);
    case "transfer":
      return transferStock(client, withoutType(payload), idempotencyKey);
  }
}

/** Drop the journal-only `type` discriminant so only the real SDK args are forwarded. */
function withoutType<T extends JournalPayload>(payload: T): Omit<T, "type"> {
  const clone: Record<string, unknown> = { ...payload };
  delete clone.type;
  return clone as Omit<T, "type">;
}
