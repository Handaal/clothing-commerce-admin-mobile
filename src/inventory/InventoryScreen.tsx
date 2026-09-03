import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

// Feature-agnostic Commerce-error display helpers, shared with the Products read surface.
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  Divider,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SurfaceRow,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { InventoryOperations } from "./InventoryOperations";
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
  // One bounded producer that follows the server cursor across all pages (see loadAllInventory).
  const load = useCallback(() => loadAllInventory(client), [client]);
  const { state, reload } = useAsync<InventoryItem[]>(load);

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
          locations={context.access.inventory.locations}
          write={context.access.inventory.write}
          items={state.data}
          onRefresh={reload}
          onConcurrencyConflict={refreshAfterConcurrency}
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
