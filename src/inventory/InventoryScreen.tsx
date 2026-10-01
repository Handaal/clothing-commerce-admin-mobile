import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

// Feature-agnostic Commerce-error display helpers, shared with the Products read surface.
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import { resolveSupplierAdapter } from "../suppliers/adapter";
import { loadAllSuppliers } from "../suppliers/load";
import type { SupplierSummary } from "../suppliers/model";
import {
  Badge,
  Body,
  Divider,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  type SelectOption,
  SurfaceRow,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { InventoryOperations } from "./InventoryOperations";
import {
  createDurableJournalStore,
  quarantineLegacyV1,
  readLegacyV1Unresolved,
} from "./journal/durable-store";
import { createInventoryJournal } from "./journal/journal";
import type { JournalOwner } from "./journal/model";
import { secureIdempotencyKey } from "./idempotency";
import { loadAllInventory, type InventoryItem } from "./load";

export interface InventoryScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack: () => void;
}

/**
 * Read-only Inventory list for the active tenant. It reads inventory access from `/me/context` only
 * for UX, but the server stays authoritative: a real `GET /inventory` that is denied surfaces as a
 * classified error (never a silent empty list). The write panel uses server-derived capability
 * guidance for UX while the API remains authoritative for every mutation.
 */
export function InventoryScreen({ tenantId, context, onBack }: InventoryScreenProps) {
  // Context-driven UX gate, checked before any fetch is issued. This is not authorization — the API
  // enforces that — but there is no point calling `/inventory` for a caller known to lack read
  // access. Rendering a distinct component means the fetch hook below never runs in this case.
  if (!context.access.inventory.canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Inventory" title="Inventory" onBack={onBack} />
        <Divider />
        <Body>You do not have read access to inventory. Ask an owner or administrator.</Body>
      </ScrollScreen>
    );
  }

  return <InventoryContent tenantId={tenantId} context={context} onBack={onBack} />;
}

function InventoryContent({ tenantId, context, onBack }: InventoryScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  // Journal ownership is scoped to tenant AND acting membership — the same actor fingerprint the API
  // scopes inventory idempotency to — using the canonical `/me/context` membership id. One user's
  // unresolved commands are therefore never visible to, or replayable by, another on the same device.
  const owner = useMemo<JournalOwner>(
    () => ({ tenantId, membershipId: context.membership.id }),
    [tenantId, context.membership.id],
  );
  // The durable inventory-mutation journal: membership-scoped, device-backed so a high-risk command
  // whose response is lost survives an app restart and is recovered rather than silently re-minted.
  // Recreated when the owner changes, so a user switch loads that user's own journal (not another's).
  const journal = useMemo(
    () => createInventoryJournal(createDurableJournalStore(owner), owner, secureIdempotencyKey),
    [owner],
  );
  const detectLegacy = useCallback(() => readLegacyV1Unresolved(owner), [owner]);
  // One bounded producer that follows the server cursor across all pages (see loadAllInventory).
  const load = useCallback(() => loadAllInventory(client), [client]);
  const { state, reload } = useAsync<InventoryItem[]>(load);

  // Phase 2N: load ACTIVE suppliers to offer for optional receipt linking, only when the caller has
  // supplier read access. This is best-effort — supplier linking is optional, so a failed or in-flight
  // supplier load never blocks receiving: the Receive form simply falls back to a legacy no-supplier
  // receipt. Inactive suppliers are excluded server-side (status filter) so they are never selectable.
  const supplierAdapter = useMemo(
    () => (context.access.suppliers?.canRead ? resolveSupplierAdapter(client) : null),
    [client, context.access.suppliers?.canRead],
  );
  const loadSuppliers = useCallback(
    () =>
      supplierAdapter
        ? loadAllSuppliers(supplierAdapter, { status: "active" })
        : Promise.resolve<SupplierSummary[]>([]),
    [supplierAdapter],
  );
  const suppliers = useAsync<SupplierSummary[]>(loadSuppliers);
  const receiveSuppliers = useMemo<SelectOption[] | undefined>(
    () =>
      suppliers.state.status === "success"
        ? suppliers.state.data.map((s) => ({
            value: s.id,
            label: s.referenceCode ? `${s.name} · ${s.referenceCode}` : s.name,
          }))
        : undefined,
    [suppliers.state],
  );

  // The inventory item carries only a location id; the human name comes from /me/context access,
  // mirroring how Products resolves brand names. Locations not present in access simply show their
  // id — the quantity is never hidden or altered because a name is missing.
  const locationNameById = useMemo(
    () => new Map(context.access.inventory.locations.map((loc) => [loc.id, loc.name])),
    [context],
  );

  const [concurrencyNotice, setConcurrencyNotice] = useState(false);
  const refreshAfterConcurrency = useCallback(() => {
    setConcurrencyNotice(true);
    reload();
  }, [reload]);

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Inventory" title="Inventory" onBack={onBack} />
      <Divider />
      {concurrencyNotice ? (
        <View style={{ gap: 8 }} testID="inventory-concurrency-notice">
          <Title>Inventory changed</Title>
          <Body>
            Inventory was refreshed from the server. Review the current on-hand quantity, then
            select the row and enter the physical count again before submitting a new adjustment.
          </Body>
          <PrimaryButton
            label="Review refreshed inventory"
            onPress={() => setConcurrencyNotice(false)}
          />
        </View>
      ) : null}
      {state.status === "success" ? (
        <InventoryOperations
          client={client}
          journal={journal}
          locations={context.access.inventory.locations}
          write={context.access.inventory.write}
          items={state.data}
          onRefresh={reload}
          onConcurrencyConflict={refreshAfterConcurrency}
          receiveSuppliers={receiveSuppliers}
          detectLegacy={detectLegacy}
          quarantineLegacy={quarantineLegacyV1}
        />
      ) : null}
      {state.status === "success" ? <Divider /> : null}
      {state.status === "loading" ? <LoadingBlock label="Loading inventory…" /> : null}
      {state.status === "error" ? (
        <>
          <Title>{errorHeading(state.error.kind)}</Title>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label="Try again" onPress={reload} />
          ) : null}
        </>
      ) : null}
      {state.status === "success" && state.data.length === 0 ? (
        <Body>No inventory yet. Stock counted in this business will appear here.</Body>
      ) : null}
      {state.status === "success" && state.data.length > 0 ? (
        <View style={{ gap: 12 }}>
          {state.data.map((item) => {
            const rowKey = `${item.inventoryLocationId}:${item.variantId}`;
            const locationName =
              locationNameById.get(item.inventoryLocationId) ?? item.inventoryLocationId;
            return (
              <SurfaceRow key={rowKey} testID={`inventory-row-${rowKey}`}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Title>{item.productName}</Title>
                  {/* On-hand is shown exactly as returned; zero renders honestly as "0". */}
                  <Badge label={String(item.onHand)} testID={`inventory-onhand-${rowKey}`} />
                </View>
                <InfoRow label="SKU" value={item.sku} />
                <InfoRow label="Location" value={locationName} />
              </SurfaceRow>
            );
          })}
        </View>
      ) : null}
    </ScrollScreen>
  );
}
