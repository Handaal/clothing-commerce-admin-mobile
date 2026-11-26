import type {
  AllocateInventoryChannelsInput,
  InventoryChannelStateResponse,
} from "@shifted/clothing-commerce-sdk";

import type { InventoryItem } from "./load";

/**
 * Pure helpers for the Website/POS split screen (ADR-042). The API is authoritative: these checks only
 * mirror its rules so the owner sees a problem before saving; the server re-validates everything.
 */

export type ChannelBalance = InventoryChannelStateResponse["items"][number];

export interface SplitRow {
  variantId: string;
  productName: string;
  sku: string;
  /** Canonical on-hand at this location. */
  onHand: number;
  /** Inventory balance version, sent back as expectedBalanceVersion so stale numbers are refused. */
  balanceVersion: number;
  /**
   * Split (allocation) version, sent back as expectedAllocationVersion: another admin's save since this
   * screen loaded makes the server answer 409 instead of silently overwriting it (ADR-042 §3.5).
   */
  allocationVersion: number;
  websiteOnHand: number;
  posOnHand: number;
  unallocatedOnHand: number;
  websiteReserved: number;
  posReserved: number;
  mismatch: number;
  explicitlyAllocated: boolean;
}

/** Joins the channel buckets with the inventory list (names, SKU, version) for one location. */
export function buildSplitRows(
  balances: readonly ChannelBalance[],
  inventory: readonly InventoryItem[],
  inventoryLocationId: string,
): SplitRow[] {
  const details = new Map(
    inventory
      .filter((item) => item.inventoryLocationId === inventoryLocationId)
      .map((item) => [item.variantId, item]),
  );
  return balances
    .map((balance) => {
      const detail = details.get(balance.variantId);
      return {
        variantId: balance.variantId,
        productName: detail?.productName ?? balance.variantId,
        sku: detail?.sku ?? "",
        onHand: balance.canonicalOnHand,
        // Versions come from the channel state itself (one consistent read), not the inventory list.
        balanceVersion: balance.balanceVersion,
        allocationVersion: balance.allocationVersion,
        websiteOnHand: balance.websiteOnHand,
        posOnHand: balance.posOnHand,
        unallocatedOnHand: balance.unallocatedOnHand,
        websiteReserved: balance.websiteReserved,
        posReserved: balance.posReserved,
        mismatch: balance.mismatch,
        explicitlyAllocated: balance.explicitlyAllocated,
      };
    })
    .sort((a, b) => a.productName.localeCompare(b.productName) || a.sku.localeCompare(b.sku));
}

/** The owner's typed values for one row (strings, exactly as entered). */
export interface SplitDraft {
  website: string;
  pos: string;
}

export type SplitRowError =
  "invalidNumber" | "overOnHand" | "belowWebsiteReserved" | "belowPosReserved";

export interface EvaluatedSplitRow {
  website: number | null;
  pos: number | null;
  /** Remainder shown live; null while an input is not a valid whole number. */
  unallocated: number | null;
  error: SplitRowError | null;
  changed: boolean;
}

function parseWhole(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,12}$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function evaluateSplitRow(row: SplitRow, draft: SplitDraft | undefined): EvaluatedSplitRow {
  if (draft === undefined) {
    return {
      website: row.websiteOnHand,
      pos: row.posOnHand,
      unallocated: row.unallocatedOnHand,
      error: null,
      changed: false,
    };
  }
  const website = parseWhole(draft.website);
  const pos = parseWhole(draft.pos);
  if (website === null || pos === null) {
    return { website, pos, unallocated: null, error: "invalidNumber", changed: true };
  }
  const changed = website !== row.websiteOnHand || pos !== row.posOnHand || row.mismatch !== 0;
  const unallocated = row.onHand - website - pos;
  let error: SplitRowError | null = null;
  if (unallocated < 0) error = "overOnHand";
  else if (website < row.websiteReserved) error = "belowWebsiteReserved";
  else if (pos < row.posReserved) error = "belowPosReserved";
  return { website, pos, unallocated, error, changed };
}

export interface SplitTotals {
  website: number;
  pos: number;
  unallocated: number;
  notSplit: number;
}

export function splitTotals(rows: readonly SplitRow[]): SplitTotals {
  return rows.reduce<SplitTotals>(
    (sum, row) => ({
      website: sum.website + row.websiteOnHand,
      pos: sum.pos + row.posOnHand,
      unallocated: sum.unallocated + row.unallocatedOnHand,
      notSplit: sum.notSplit + (row.onHand > 0 && !row.explicitlyAllocated ? 1 : 0),
    }),
    { website: 0, pos: 0, unallocated: 0, notSplit: 0 },
  );
}

export type SplitLines = AllocateInventoryChannelsInput["lines"];

/**
 * Builds the request lines from every edited row. Returns null when any edited row is invalid, so the
 * save button stays disabled. Unchanged rows are never sent.
 */
export function buildAllocationLines(
  rows: readonly SplitRow[],
  drafts: Readonly<Record<string, SplitDraft>>,
): SplitLines | null {
  const lines: SplitLines = [];
  for (const row of rows) {
    const draft = drafts[row.variantId];
    if (draft === undefined) continue;
    const evaluated = evaluateSplitRow(row, draft);
    if (evaluated.error !== null || evaluated.website === null || evaluated.pos === null) {
      return null;
    }
    if (!evaluated.changed) continue;
    lines.push({
      variantId: row.variantId,
      websiteQuantity: evaluated.website,
      posQuantity: evaluated.pos,
      expectedBalanceVersion: row.balanceVersion,
      expectedAllocationVersion: row.allocationVersion,
    });
  }
  return lines;
}
