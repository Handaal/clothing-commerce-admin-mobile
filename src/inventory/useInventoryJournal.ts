import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo } from "react";

import { secureIdempotencyKey } from "./idempotency";
import { createDurableJournalStore, readLegacyV1Unresolved } from "./journal/durable-store";
import { createInventoryJournal, type InventoryJournal } from "./journal/journal";
import type { JournalEntry, JournalOwner } from "./journal/model";

/**
 * The durable inventory command journal bound to the signed-in owner (business + staff member). Every
 * stock write goes through it so a change whose response was lost is finished later with the same
 * idempotency key instead of being counted twice. Shared by the Stock list and Receive new stock.
 */
export function useInventoryJournal(
  tenantId: string,
  context: MeContextResponse,
): { journal: InventoryJournal; detectLegacy: () => Promise<JournalEntry[]> } {
  const owner = useMemo<JournalOwner>(
    () => ({ tenantId, membershipId: context.membership.id }),
    [tenantId, context.membership.id],
  );
  const journal = useMemo(
    () => createInventoryJournal(createDurableJournalStore(owner), owner, secureIdempotencyKey),
    [owner],
  );
  const detectLegacy = useCallback(() => readLegacyV1Unresolved(owner), [owner]);
  return { journal, detectLegacy };
}
