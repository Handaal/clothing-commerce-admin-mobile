import type {
  AdjustInventoryResponse,
  ReceiveInventoryResponse,
  TenantCommerceClient,
  TransferInventoryResponse,
} from "@shifted/clothing-commerce-sdk";

import type { InventoryItem } from "./load";

/**
 * Pure producers for the three Phase 2G inventory writes. Each takes the tenant-scoped SDK client, the
 * business args, and the idempotency key, and returns the SDK response verbatim. They add no headers,
 * issue no direct `fetch`, and invent no contract fields — the SDK owns the transport, tenant header,
 * and the `Idempotency-Key` header. Kept React-free so they are unit-testable in isolation and can be
 * wrapped by `useMutation`.
 */

export type ReceiveClient = Pick<TenantCommerceClient, "receiveInventory">;
export type AdjustClient = Pick<TenantCommerceClient, "adjustInventory">;
export type TransferClient = Pick<TenantCommerceClient, "transferInventory">;

export interface ReceiveArgs {
  variantId: string;
  inventoryLocationId: string;
  quantity: number;
  note?: string;
}

export interface AdjustArgs {
  variantId: string;
  inventoryLocationId: string;
  countedQuantity: number;
  /** The version this physical count was taken against; a stale value is a safe 409, never an overwrite. */
  expectedVersion: number;
  note?: string;
}

export interface TransferArgs {
  variantId: string;
  sourceInventoryLocationId: string;
  destinationInventoryLocationId: string;
  quantity: number;
  note?: string;
}

export function receiveStock(
  client: ReceiveClient,
  args: ReceiveArgs,
  idempotencyKey: string,
): Promise<ReceiveInventoryResponse> {
  return client.receiveInventory({ ...args, idempotencyKey });
}

export function adjustStock(
  client: AdjustClient,
  args: AdjustArgs,
  idempotencyKey: string,
): Promise<AdjustInventoryResponse> {
  return client.adjustInventory({ ...args, idempotencyKey });
}

export function transferStock(
  client: TransferClient,
  args: TransferArgs,
  idempotencyKey: string,
): Promise<TransferInventoryResponse> {
  return client.transferInventory({ ...args, idempotencyKey });
}

/** Stable key for a stock row (an inventory balance is uniquely a location × variant). */
export function rowKey(inventoryLocationId: string, variantId: string): string {
  return `${inventoryLocationId}:${variantId}`;
}

export interface VariantOption {
  variantId: string;
  productName: string;
  sku: string;
}

/**
 * The distinct variants present in the loaded inventory, in first-seen (server) order. This is the
 * only in-app source of real variant identity for the write forms — the app never hardcodes variant
 * ids and there is no separate variant catalog fetch on this surface.
 */
export function distinctVariants(items: InventoryItem[]): VariantOption[] {
  const byId = new Map<string, VariantOption>();
  for (const item of items) {
    if (!byId.has(item.variantId)) {
      byId.set(item.variantId, {
        variantId: item.variantId,
        productName: item.productName,
        sku: item.sku,
      });
    }
  }
  return [...byId.values()];
}

/**
 * Local, pre-submit validation. It is a UX convenience only — the API is authoritative and re-checks
 * every rule server-side. `null` means "no local objection"; a string is a human message.
 */

// Receive and transfer move a positive count of physical units.
export function validatePositiveQuantity(quantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return "Enter a whole quantity greater than zero.";
  }
  if (!Number.isSafeInteger(quantity)) {
    return "That quantity is too large.";
  }
  return null;
}

// A reconciliation states an absolute physical on-hand, which may legitimately be zero.
export function validateCountedQuantity(countedQuantity: number): string | null {
  if (!Number.isInteger(countedQuantity) || countedQuantity < 0) {
    return "Enter the counted quantity as a whole number (zero or more).";
  }
  if (!Number.isSafeInteger(countedQuantity)) {
    return "That quantity is too large.";
  }
  return null;
}

// A transfer's source and destination must differ; block the obviously invalid case locally so the
// user never issues a request the API would reject with SAME_TRANSFER_LOCATION.
export function validateTransferLocations(
  sourceInventoryLocationId: string,
  destinationInventoryLocationId: string,
): string | null {
  if (
    sourceInventoryLocationId !== "" &&
    sourceInventoryLocationId === destinationInventoryLocationId
  ) {
    return "Source and destination must be different locations.";
  }
  return null;
}
