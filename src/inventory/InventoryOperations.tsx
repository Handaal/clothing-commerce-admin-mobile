import type {
  AdjustInventoryResponse,
  MeContextResponse,
  ReceiveInventoryResponse,
  TenantCommerceClient,
  TransferInventoryResponse,
} from "@shifted/clothing-commerce-sdk";
import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import {
  Badge,
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  NumberField,
  PrimaryButton,
  SelectField,
  type SelectOption,
  TextButton,
  TextField,
  Title,
} from "../ui/components";
import { type MutationState } from "../ui/useMutation";
import type { InventoryItem } from "./load";
import { InventoryRecoveryPanel } from "./journal/InventoryRecoveryPanel";
import type { InventoryJournal } from "./journal/journal";
import {
  normalizeAdjustPayload,
  normalizeReceivePayload,
  normalizeTransferPayload,
} from "./journal/model";
import {
  useJournaledInventoryMutation,
  type JournaledMutation,
} from "./journal/useJournaledInventoryMutation";
import {
  distinctVariants,
  rowKey,
  validateCountedQuantity,
  validatePositiveQuantity,
  validateTransferLocations,
} from "./operations";
import { describeInventoryWriteError } from "./write-errors";

/** A location the caller may act on, exactly as `/me/context` returns it. */
export type InventoryLocationRef = MeContextResponse["access"]["inventory"]["locations"][number];
export type InventoryWriteAccess = MeContextResponse["access"]["inventory"]["write"];

export interface InventoryOperationsProps {
  /** Tenant-scoped SDK client. The only path to the API — never a direct fetch. */
  client: Pick<TenantCommerceClient, "receiveInventory" | "adjustInventory" | "transferInventory">;
  /** Locations the caller may act on, exactly as returned by `/me/context` (no hardcoded dev ids). */
  locations: InventoryLocationRef[];
  /** Server-derived write capability guidance. The API still authorizes every mutation. */
  write: InventoryWriteAccess;
  /** Currently loaded inventory rows — the real source of selectable variants. */
  items: InventoryItem[];
  /** Re-read the authoritative inventory from the server after a successful (or conflicting) write. */
  onRefresh: () => void;
  /** Invalidate a stale adjustment and re-read authoritative inventory after a 409. */
  onConcurrencyConflict: () => void;
  /**
   * Durable command journal for the high-risk inventory writes. It owns idempotency-key identity so a
   * command whose response was lost survives a restart and is recovered rather than silently re-minted.
   */
  journal: InventoryJournal;
  /** Tenant/context the journaled commands belong to (scopes every journal read and write). */
  tenantId: string;
  /**
   * Phase 2N: OPTIONAL supplier linking for the Receive form. When provided, the form offers these
   * ACTIVE suppliers (the caller excludes inactive ones — they cannot back a new receipt) plus an
   * explicit "No supplier" choice, and an optional supplier reference. When omitted, or when the
   * operator leaves it on "No supplier", the receipt is a legacy no-supplier receipt and behaves
   * exactly as before. The chosen `supplierId`/`supplierReference` are part of the receive intent, so
   * changing them changes the idempotency intent (a new key), never a silently mutated retry.
   */
  receiveSuppliers?: SelectOption[];
}

type OpKind = "receive" | "adjust" | "transfer";

/**
 * The three inventory WRITE actions layered onto the read surface. Opening Stock and Generic Issue are
 * deliberately absent. Visibility and choices follow server-derived write capability guidance. The API
 * still authorizes every write, and a real 403 surfaces as an explicit denied state.
 */
export function InventoryOperations(props: InventoryOperationsProps) {
  const [activeOp, setActiveOp] = useState<OpKind | null>(null);

  const variantOptions = useMemo<SelectOption[]>(
    () =>
      distinctVariants(props.items).map((v) => ({
        value: v.variantId,
        label: `${v.productName} · ${v.sku}`,
      })),
    [props.items],
  );
  const receiveLocationOptions = useMemo<SelectOption[]>(
    () =>
      props.write.locations
        .filter((location) => location.canReceive)
        .map((location) => ({ value: location.id, label: location.name })),
    [props.write.locations],
  );
  const transferSourceOptions = useMemo<SelectOption[]>(
    () =>
      props.write.locations
        .filter((location) => location.canTransferOrigin)
        .map((location) => ({ value: location.id, label: location.name })),
    [props.write.locations],
  );
  const transferDestinationOptions = useMemo<SelectOption[]>(
    () =>
      props.write.locations
        .filter((location) => location.canTransferDestination)
        .map((location) => ({ value: location.id, label: location.name })),
    [props.write.locations],
  );

  return (
    <View style={{ gap: 12 }}>
      <Eyebrow>Inventory operations</Eyebrow>
      <Body>
        These operations are authorized by the Commerce API. Role names grant nothing here; a denied
        write is shown as an explicit access-denied state, never silently ignored.
      </Body>
      {/* Restart/remount recovery: any inventory command whose result was never confirmed is surfaced
          here and completed by replaying its original idempotency key — never re-minted into a duplicate. */}
      <InventoryRecoveryPanel
        journal={props.journal}
        tenantId={props.tenantId}
        client={props.client}
        items={props.items}
        locations={props.locations}
        onResolved={props.onRefresh}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {props.write.canReceive ? (
          <OpTab
            label="Receive stock"
            testID="open-receive"
            active={activeOp === "receive"}
            onPress={() => setActiveOp(activeOp === "receive" ? null : "receive")}
          />
        ) : null}
        {props.write.canAdjust ? (
          <OpTab
            label="Adjust (reconcile)"
            testID="open-adjust"
            active={activeOp === "adjust"}
            onPress={() => setActiveOp(activeOp === "adjust" ? null : "adjust")}
          />
        ) : null}
        {props.write.canTransfer ? (
          <OpTab
            label="Transfer stock"
            testID="open-transfer"
            active={activeOp === "transfer"}
            onPress={() => setActiveOp(activeOp === "transfer" ? null : "transfer")}
          />
        ) : null}
      </View>

      {activeOp === "receive" && props.write.canReceive ? (
        <ReceiveForm
          {...props}
          variantOptions={variantOptions}
          locationOptions={receiveLocationOptions}
          supplierOptions={props.receiveSuppliers}
        />
      ) : null}
      {activeOp === "adjust" && props.write.canAdjust ? <AdjustForm {...props} /> : null}
      {activeOp === "transfer" && props.write.canTransfer ? (
        <TransferForm
          {...props}
          variantOptions={variantOptions}
          sourceOptions={transferSourceOptions}
          destinationOptions={transferDestinationOptions}
        />
      ) : null}
    </View>
  );
}

function OpTab({
  label,
  testID,
  active,
  onPress,
}: {
  label: string;
  testID: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <View style={{ flexGrow: 1, minWidth: 150 }}>
      <PrimaryButton label={active ? `▾ ${label}` : label} testID={testID} onPress={onPress} />
    </View>
  );
}

function locationName(locations: InventoryLocationRef[], id: string): string {
  return locations.find((l) => l.id === id)?.name ?? id;
}

/** Resolve a supplier's display label from the offered options, falling back to the raw id. */
function supplierLabel(options: SelectOption[] | undefined, id: string): string {
  return options?.find((o) => o.value === id)?.label ?? id;
}

/**
 * On a write success (and only once per result), trigger an authoritative server refresh. Final
 * balances and future adjustment versions always come from the inventory list re-read.
 */
function useRefreshOnSuccess<TResult>(state: MutationState<TResult>, onRefresh: () => void) {
  // Keep the latest callback behind a ref so the effect runs once for the mutation state transition,
  // not again merely because a parent callback identity changes.
  const latest = useRef(onRefresh);
  useEffect(() => {
    latest.current = onRefresh;
  });
  useEffect(() => {
    if (state.status !== "success") return;
    latest.current();
  }, [state]);
}

function variantLabel(
  items: InventoryItem[],
  variantId: string,
): { productName: string; sku: string } {
  const found = items.find((i) => i.variantId === variantId);
  return { productName: found?.productName ?? variantId, sku: found?.sku ?? "" };
}

// ---------------------------------------------------------------------------------------------------
// Shared error / success panels
// ---------------------------------------------------------------------------------------------------

function WriteError<TResult extends object>({
  state,
  mutation,
}: {
  state: Extract<MutationState<TResult>, { status: "error" }>;
  mutation: JournaledMutation<TResult>;
}) {
  const described = describeInventoryWriteError(state.error);
  return (
    <View style={{ gap: 8 }} testID="write-error">
      <Title>{described.heading}</Title>
      <Body>{described.message}</Body>
      {described.recovery === "retry" ? (
        // AMBIGUOUS outcome: retry reuses the SAME idempotency key (at-most-once).
        <PrimaryButton label="Retry" testID="write-retry" onPress={() => mutation.retry()} />
      ) : null}
      {described.recovery === "edit" ? (
        <PrimaryButton
          label="Edit and try again"
          testID="write-edit"
          onPress={() => mutation.reset()}
        />
      ) : null}
      {described.recovery === "none" ? (
        <TextButton label="Dismiss" onPress={() => mutation.reset()} />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// Receive
// ---------------------------------------------------------------------------------------------------

/** Sentinel option value for "no supplier" — kept distinct from any real supplier id (a UUID). */
const NO_SUPPLIER = "";

function ReceiveForm(
  props: InventoryOperationsProps & {
    variantOptions: SelectOption[];
    locationOptions: SelectOption[];
    supplierOptions?: SelectOption[];
  },
) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [inventoryLocationId, setLocationId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [supplierId, setSupplierId] = useState<string>(NO_SUPPLIER);
  const [supplierReference, setSupplierReference] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const suppliersEnabled = (props.supplierOptions?.length ?? 0) > 0;
  // Prepend an explicit "No supplier" choice so leaving a receipt unlinked is a deliberate selection.
  const supplierSelectOptions = useMemo<SelectOption[]>(
    () => [{ value: NO_SUPPLIER, label: "No supplier" }, ...(props.supplierOptions ?? [])],
    [props.supplierOptions],
  );
  const hasSupplier = suppliersEnabled && supplierId !== NO_SUPPLIER;

  const mutation = useJournaledInventoryMutation<ReceiveInventoryResponse>({
    client: props.client,
    journal: props.journal,
    tenantId: props.tenantId,
  });

  useRefreshOnSuccess(mutation.state, props.onRefresh);

  function onSubmit() {
    const qty = Number(quantity);
    const problem =
      !variantId || !inventoryLocationId
        ? "Choose an item and a location."
        : validatePositiveQuantity(qty);
    setLocalError(problem);
    if (problem || !variantId || !inventoryLocationId) return;
    const reference = supplierReference.trim();
    mutation.submit(
      normalizeReceivePayload({
        variantId,
        inventoryLocationId,
        quantity: qty,
        ...(note.trim() ? { note: note.trim() } : {}),
        // Supplier link is optional; both fields are omitted entirely for a legacy no-supplier receipt.
        ...(hasSupplier ? { supplierId } : {}),
        ...(hasSupplier && reference ? { supplierReference: reference } : {}),
      }),
    );
  }

  if (mutation.state.status === "success") {
    const r = mutation.state.data;
    const { productName, sku } = variantLabel(props.items, r.variantId);
    return (
      <SuccessPanel
        testID="receive-success"
        onReset={() => {
          mutation.reset();
          setQuantity("");
          setNote("");
          setSupplierId(NO_SUPPLIER);
          setSupplierReference("");
        }}
        resetLabel="New receipt"
      >
        <Title>Stock received</Title>
        <InfoRow label="Item" value={`${productName} · ${sku}`} />
        <InfoRow label="Location" value={locationName(props.locations, r.inventoryLocationId)} />
        {r.supplierId ? (
          <View testID="receive-supplier-result">
            <InfoRow label="Supplier" value={supplierLabel(props.supplierOptions, r.supplierId)} />
          </View>
        ) : null}
        {r.supplierReference ? (
          <InfoRow label="Supplier reference" value={r.supplierReference} />
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Body>On hand now</Body>
          <Badge label={String(r.observedOnHand)} testID="receive-observed-onhand" />
        </View>
      </SuccessPanel>
    );
  }

  return (
    <FormShell title="Receive stock" hint="Record physical stock that arrived into a location.">
      <SelectField
        label="Item"
        options={props.variantOptions}
        selected={variantId}
        onSelect={setVariantId}
        testIDPrefix="receive-variant"
        emptyLabel="No items are visible in inventory yet."
      />
      <SelectField
        label="Location"
        options={props.locationOptions}
        selected={inventoryLocationId}
        onSelect={setLocationId}
        testIDPrefix="receive-location"
      />
      {/* Phase 2N: optional supplier link. Only active suppliers are offered; "No supplier" keeps the
          receipt a legacy unlinked receipt. A supplier reference is only sent alongside a supplier. */}
      {suppliersEnabled ? (
        <>
          <SelectField
            label="Supplier (optional)"
            options={supplierSelectOptions}
            selected={supplierId}
            onSelect={setSupplierId}
            testIDPrefix="receive-supplier"
          />
          {hasSupplier ? (
            <TextField
              label="Supplier reference (optional)"
              value={supplierReference}
              onChangeText={setSupplierReference}
              placeholder="e.g. GRN-2026-0012"
              testID="receive-supplier-reference"
              autoCapitalize="characters"
            />
          ) : null}
        </>
      ) : null}
      <NumberField
        label="Quantity received"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="e.g. 5"
        testID="receive-quantity"
      />
      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        testID="receive-note"
      />
      {localError ? <Body>{localError}</Body> : null}
      {mutation.state.status === "error" ? (
        <WriteError state={mutation.state} mutation={mutation} />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? "Receiving…" : "Receive stock"}
        testID="receive-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------------------------------
// Adjust (reconcile to an absolute physical count)
// ---------------------------------------------------------------------------------------------------

function AdjustForm(props: InventoryOperationsProps) {
  const adjustableLocationIds = useMemo(
    () =>
      new Set(
        props.write.locations
          .filter((location) => location.canAdjust)
          .map((location) => location.id),
      ),
    [props.write.locations],
  );
  const rows = useMemo(
    () => props.items.filter((item) => adjustableLocationIds.has(item.inventoryLocationId)),
    [adjustableLocationIds, props.items],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [countedQuantity, setCountedQuantity] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedRow = selectedKey
    ? (rows.find((row) => rowKey(row.inventoryLocationId, row.variantId) === selectedKey) ?? null)
    : null;

  const mutation = useJournaledInventoryMutation<AdjustInventoryResponse>({
    client: props.client,
    journal: props.journal,
    tenantId: props.tenantId,
  });

  useRefreshOnSuccess(mutation.state, props.onRefresh);

  const isConcurrencyConflict =
    mutation.state.status === "error" &&
    describeInventoryWriteError(mutation.state.error).isConcurrencyConflict;
  const onConcurrencyConflict = props.onConcurrencyConflict;
  useEffect(() => {
    if (!isConcurrencyConflict) return;
    // The parent refresh moves Inventory into loading state and unmounts this form, abandoning the
    // stale key, args, selection and count. The remounted form can use only the refreshed row version.
    onConcurrencyConflict();
  }, [isConcurrencyConflict, onConcurrencyConflict]);

  const options = useMemo<SelectOption[]>(
    () =>
      rows.map((r) => ({
        value: rowKey(r.inventoryLocationId, r.variantId),
        label: `${r.productName} · ${r.sku} @ ${locationName(props.locations, r.inventoryLocationId)} — on hand ${r.onHand} (v${r.version})`,
      })),
    [props.locations, rows],
  );

  function onSubmit() {
    const counted = Number(countedQuantity);
    const problem = !selectedRow
      ? "Choose an item to reconcile."
      : validateCountedQuantity(counted);
    setLocalError(problem);
    if (problem || !selectedRow) return;
    mutation.submit(
      normalizeAdjustPayload({
        variantId: selectedRow.variantId,
        inventoryLocationId: selectedRow.inventoryLocationId,
        countedQuantity: counted,
        expectedVersion: selectedRow.version,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    );
  }

  if (mutation.state.status === "success") {
    const r = mutation.state.data;
    return (
      <SuccessPanel
        testID="adjust-success"
        onReset={() => {
          mutation.reset();
          setCountedQuantity("");
        }}
        resetLabel="New reconciliation"
      >
        <Title>{r.changed ? "Stock reconciled" : "Count confirmed (no change)"}</Title>
        <InfoRow label="Previous on hand" value={String(r.previousOnHand)} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Body>Counted on hand</Body>
          <Badge label={String(r.newOnHand)} testID="adjust-new-onhand" />
        </View>
      </SuccessPanel>
    );
  }

  return (
    <FormShell
      title="Adjust (reconcile)"
      hint="State the actual physical count. It reconciles against the version in the current inventory row."
    >
      {options.length === 0 ? (
        <Body>No inventory rows are available at locations where adjustment is permitted.</Body>
      ) : (
        <>
          <SelectField
            label="Item to reconcile"
            options={options}
            selected={selectedKey}
            onSelect={setSelectedKey}
            testIDPrefix="adjust-row"
          />
          <NumberField
            label="Counted physical quantity"
            value={countedQuantity}
            onChangeText={setCountedQuantity}
            placeholder="actual count"
            testID="adjust-counted"
          />
          <TextField
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            testID="adjust-note"
          />
          {localError ? <Body>{localError}</Body> : null}
          {mutation.state.status === "error" && !isConcurrencyConflict ? (
            <WriteError state={mutation.state} mutation={mutation} />
          ) : null}
          <PrimaryButton
            label={mutation.state.status === "submitting" ? "Reconciling…" : "Reconcile to count"}
            testID="adjust-submit"
            disabled={mutation.state.status === "submitting"}
            onPress={onSubmit}
          />
        </>
      )}
    </FormShell>
  );
}

// ---------------------------------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------------------------------

function TransferForm(
  props: InventoryOperationsProps & {
    variantOptions: SelectOption[];
    sourceOptions: SelectOption[];
    destinationOptions: SelectOption[];
  },
) {
  const [variantId, setVariantId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useJournaledInventoryMutation<TransferInventoryResponse>({
    client: props.client,
    journal: props.journal,
    tenantId: props.tenantId,
  });

  useRefreshOnSuccess(mutation.state, props.onRefresh);

  // Prevent the obviously invalid source == destination locally by disabling the chosen source in the
  // destination list (the API also rejects it with SAME_TRANSFER_LOCATION).
  const destinationOptions = props.destinationOptions.map((o) => ({
    ...o,
    disabled: o.value === sourceId,
  }));

  function onSubmit() {
    const qty = Number(quantity);
    const problem =
      !variantId || !sourceId || !destinationId
        ? "Choose an item, a source and a destination."
        : (validateTransferLocations(sourceId, destinationId) ?? validatePositiveQuantity(qty));
    setLocalError(problem);
    if (problem || !variantId || !sourceId || !destinationId) return;
    mutation.submit(
      normalizeTransferPayload({
        variantId,
        sourceInventoryLocationId: sourceId,
        destinationInventoryLocationId: destinationId,
        quantity: qty,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    );
  }

  if (mutation.state.status === "success") {
    const r = mutation.state.data;
    return (
      <SuccessPanel
        testID="transfer-success"
        onReset={() => {
          mutation.reset();
          setQuantity("");
          setNote("");
        }}
        resetLabel="New transfer"
      >
        <Title>Stock transferred</Title>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Body>{locationName(props.locations, r.source.inventoryLocationId)}</Body>
          <Badge label={String(r.source.observedOnHand)} testID="transfer-source-onhand" />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Body>{locationName(props.locations, r.destination.inventoryLocationId)}</Body>
          <Badge
            label={String(r.destination.observedOnHand)}
            testID="transfer-destination-onhand"
          />
        </View>
      </SuccessPanel>
    );
  }

  return (
    <FormShell
      title="Transfer stock"
      hint="Move stock from one location to another in one operation."
    >
      <SelectField
        label="Item"
        options={props.variantOptions}
        selected={variantId}
        onSelect={setVariantId}
        testIDPrefix="transfer-variant"
        emptyLabel="No items are visible in inventory yet."
      />
      <SelectField
        label="From (source)"
        options={props.sourceOptions}
        selected={sourceId}
        onSelect={setSourceId}
        testIDPrefix="transfer-source"
      />
      <SelectField
        label="To (destination)"
        options={destinationOptions}
        selected={destinationId}
        onSelect={setDestinationId}
        testIDPrefix="transfer-destination"
      />
      <NumberField
        label="Quantity to move"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="e.g. 3"
        testID="transfer-quantity"
      />
      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        testID="transfer-note"
      />
      {localError ? <Body>{localError}</Body> : null}
      {mutation.state.status === "error" ? (
        <WriteError state={mutation.state} mutation={mutation} />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? "Transferring…" : "Transfer stock"}
        testID="transfer-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </FormShell>
  );
}

// ---------------------------------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------------------------------

function FormShell({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Divider />
      <Title>{title}</Title>
      <Body>{hint}</Body>
      {children}
    </View>
  );
}

function SuccessPanel({
  testID,
  onReset,
  resetLabel,
  children,
}: {
  testID: string;
  onReset: () => void;
  resetLabel: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 12 }} testID={testID}>
      <Divider />
      {children}
      <Body>Inventory has been refreshed from the server below.</Body>
      <PrimaryButton label={resetLabel} onPress={onReset} />
    </View>
  );
}
