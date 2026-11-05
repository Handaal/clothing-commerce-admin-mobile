import type {
  AdjustInventoryResponse,
  MeContextResponse,
  ReceiveInventoryResponse,
  TenantCommerceClient,
  TransferInventoryResponse,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";

import {
  AccordionTrigger,
  Badge,
  Body,
  FormSection,
  InfoRow,
  Notice,
  NumberField,
  PrimaryButton,
  SectionHeading,
  SelectField,
  type SelectOption,
  Surface,
  TextButton,
  TextField,
  Title,
} from "../ui/components";
import type { AppIconName } from "../ui/Icon";
import type { InventoryItem } from "./load";
import { InventoryRecoveryPanel } from "./journal/InventoryRecoveryPanel";
import type { InventoryJournal } from "./journal/journal";
import {
  normalizeAdjustPayload,
  normalizeReceivePayload,
  normalizeTransferPayload,
  type JournalEntry,
} from "./journal/model";
import {
  useJournaledInventoryMutation,
  type JournaledMutation,
  type JournaledMutationState,
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
   * Durable command journal for the high-risk inventory writes, bound to the active owner (tenant +
   * membership). It owns idempotency-key identity so a command whose response was lost survives a
   * restart and is recovered rather than silently re-minted.
   */
  journal: InventoryJournal;
  /** Detect un-attributable released V1 journal entries for this tenant (quarantine, never auto-replay). */
  detectLegacy?: () => Promise<JournalEntry[]>;
  /** Archive (preserve) the released V1 journal so new mutations may resume. */
  quarantineLegacy?: () => Promise<void>;
  /**
   * Phase 2N: OPTIONAL supplier linking for the Receive form. When provided, the form offers these
   * ACTIVE suppliers (the caller excludes inactive ones — they cannot back a new receipt) plus an
   * explicit "No supplier" choice, and an optional supplier reference. When omitted, or when the
   * operator leaves it on "No supplier", the receipt is a legacy no-supplier receipt and behaves
   * exactly as before. The chosen `supplierId`/`supplierReference` are part of the receive intent, so
   * changing them changes the idempotency intent (a new key), never a silently mutated retry.
   */
  receiveSuppliers?: SelectOption[];
  /** Optional controlled operation state used by a screen-level persistent action dock. */
  activeOperation?: InventoryOperationKind | null;
  onActiveOperationChange?: (operation: InventoryOperationKind | null) => void;
}

export type InventoryOperationKind = "receive" | "adjust" | "transfer";

/**
 * The three inventory WRITE actions layered onto the read surface. Opening Stock and Generic Issue are
 * deliberately absent. Visibility and choices follow server-derived write capability guidance. The API
 * still authorizes every write, and a real 403 surfaces as an explicit denied state.
 */
export function InventoryOperations(props: InventoryOperationsProps) {
  const { t } = useI18n();
  const [internalActiveOp, setInternalActiveOp] = useState<InventoryOperationKind | null>(null);
  const activeOp = props.activeOperation !== undefined ? props.activeOperation : internalActiveOp;
  const setActiveOp = props.onActiveOperationChange ?? setInternalActiveOp;
  const hasWriteAction = props.write.canReceive || props.write.canAdjust || props.write.canTransfer;
  // Fail closed at startup: write forms stay hidden until the recovery panel has validated the durable
  // V2 store AND completed the legacy V1 check and reported availability. There is deliberately NO window
  // where a mutation could be submitted before those checks finish. Read-only inventory stays usable.
  const [writesAvailable, setWritesAvailable] = useState(false);
  // A durability failure proven DURING a submit (not just at startup) is namespace-wide: the recovery
  // journal for this owner could not be secured, so EVERY write form is hidden — not just the one the
  // operator happened to be using — behind a single global notice. Read-only inventory stays usable.
  const [storageFailedPostInit, setStorageFailedPostInit] = useState(false);
  const onAvailabilityChange = useCallback((available: boolean) => {
    setWritesAvailable(available);
    // A fresh clean availability report (e.g. after recovery) clears a prior post-init failure.
    if (available) setStorageFailedPostInit(false);
  }, []);
  const onStorageUnavailable = useCallback(() => setStorageFailedPostInit(true), []);
  const formsVisible = writesAvailable && !storageFailedPostInit;

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
      <SectionHeading
        title={t("invOps.title")}
        detail={hasWriteAction ? t("invOps.chooseAction") : t("invOps.readOnlyAccess")}
      />
      <Notice message={hasWriteAction ? t("invOps.noticeWrite") : t("invOps.noticeReadOnly")} />
      {/* Restart/remount recovery: any inventory command whose result was never confirmed is surfaced
          here and completed by replaying its original idempotency key — never re-minted into a duplicate. */}
      <InventoryRecoveryPanel
        journal={props.journal}
        client={props.client}
        items={props.items}
        locations={props.locations}
        onResolved={props.onRefresh}
        detectLegacy={props.detectLegacy}
        quarantineLegacy={props.quarantineLegacy}
        onAvailabilityChange={onAvailabilityChange}
      />
      {storageFailedPostInit ? (
        <Notice
          testID="inventory-writes-unavailable"
          tone="danger"
          title={t("invOps.storagePausedTitle")}
          message={t("invOps.storagePausedMsg")}
        />
      ) : null}
      {formsVisible ? (
        <>
          <View style={{ gap: 8 }}>
            {props.write.canReceive ? (
              <OpTab
                label={t("invOps.tabReceive")}
                description={t("invOps.tabReceiveDesc")}
                icon="package-down"
                testID="open-receive"
                active={activeOp === "receive"}
                onPress={() => setActiveOp(activeOp === "receive" ? null : "receive")}
              />
            ) : null}
            {props.write.canAdjust ? (
              <OpTab
                label={t("invOps.tabAdjust")}
                description={t("invOps.tabAdjustDesc")}
                icon="clipboard-check-outline"
                testID="open-adjust"
                active={activeOp === "adjust"}
                onPress={() => setActiveOp(activeOp === "adjust" ? null : "adjust")}
              />
            ) : null}
            {props.write.canTransfer ? (
              <OpTab
                label={t("invOps.tabTransfer")}
                description={t("invOps.tabTransferDesc")}
                icon="swap-horizontal"
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
              onStorageUnavailable={onStorageUnavailable}
            />
          ) : null}
          {activeOp === "adjust" && props.write.canAdjust ? (
            <AdjustForm {...props} onStorageUnavailable={onStorageUnavailable} />
          ) : null}
          {activeOp === "transfer" && props.write.canTransfer ? (
            <TransferForm
              {...props}
              variantOptions={variantOptions}
              sourceOptions={transferSourceOptions}
              destinationOptions={transferDestinationOptions}
              onStorageUnavailable={onStorageUnavailable}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function OpTab({
  label,
  description,
  icon,
  testID,
  active,
  onPress,
}: {
  label: string;
  description: string;
  icon: AppIconName;
  testID: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AccordionTrigger
      title={label}
      description={description}
      icon={icon}
      expanded={active}
      testID={testID}
      onPress={onPress}
    />
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
function useRefreshOnSuccess<TResult>(
  state: JournaledMutationState<TResult>,
  onRefresh: () => void,
) {
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

/**
 * Report a namespace-wide durability failure to the parent the moment a submit is blocked by
 * `storage-unavailable`. The journal for this owner could not be secured, so the parent hides ALL write
 * forms (not merely the one in use). Fires once per transition into the blocked-storage state.
 */
function useReportStorageUnavailable<TResult>(
  state: JournaledMutationState<TResult>,
  onStorageUnavailable: (() => void) | undefined,
) {
  const latest = useRef(onStorageUnavailable);
  useEffect(() => {
    latest.current = onStorageUnavailable;
  });
  useEffect(() => {
    if (state.status === "blocked" && state.reason === "storage-unavailable") latest.current?.();
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
  state: Extract<JournaledMutationState<TResult>, { status: "error" }>;
  mutation: JournaledMutation<TResult>;
}) {
  const { t } = useI18n();
  const described = describeInventoryWriteError(state.error);
  return (
    <Notice
      testID="write-error"
      tone="danger"
      title={described.heading}
      message={described.message}
      action={
        described.recovery === "retry" ? (
          <PrimaryButton
            label={t("common.retry")}
            testID="write-retry"
            onPress={() => mutation.retry()}
          />
        ) : described.recovery === "edit" ? (
          <PrimaryButton
            label={t("invOps.editRetry")}
            testID="write-edit"
            onPress={() => mutation.reset()}
          />
        ) : (
          <TextButton label={t("common.dismiss")} onPress={() => mutation.reset()} />
        )
      }
    />
  );
}

/**
 * Shown when a submission was BLOCKED without transport: either durable persistence could not be
 * secured (fail closed — no API request was issued) or an equivalent operation is already unresolved and
 * must be resumed in the recovery panel above. Never exposes raw storage errors.
 */
function BlockedNotice<TResult extends object>({
  reason,
  mutation,
}: {
  reason: "storage-unavailable" | "pending-equivalent";
  mutation: JournaledMutation<TResult>;
}) {
  const { t } = useI18n();
  if (reason === "pending-equivalent") {
    return (
      <View style={{ gap: 8 }} testID="write-blocked-equivalent">
        <Title>{t("invOps.blockedEquivTitle")}</Title>
        <Body>{t("invOps.blockedEquivMsg")}</Body>
        <TextButton label={t("common.dismiss")} onPress={() => mutation.reset()} />
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }} testID="write-blocked-storage">
      <Title>{t("invOps.storagePausedTitle")}</Title>
      <Body>{t("invOps.blockedStorageMsg")}</Body>
      <TextButton label={t("common.dismiss")} onPress={() => mutation.reset()} />
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
    onStorageUnavailable?: () => void;
  },
) {
  const { t } = useI18n();
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
    () => [{ value: NO_SUPPLIER, label: t("invOps.noSupplier") }, ...(props.supplierOptions ?? [])],
    [props.supplierOptions, t],
  );
  const hasSupplier = suppliersEnabled && supplierId !== NO_SUPPLIER;

  const mutation = useJournaledInventoryMutation<ReceiveInventoryResponse>({
    client: props.client,
    journal: props.journal,
  });

  useRefreshOnSuccess(mutation.state, props.onRefresh);
  useReportStorageUnavailable(mutation.state, props.onStorageUnavailable);

  function onSubmit() {
    const qty = Number(quantity);
    const problem =
      !variantId || !inventoryLocationId
        ? t("invOps.chooseItemLocation")
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
        resetLabel={t("invOps.newReceipt")}
      >
        <Title>{t("invOps.stockReceived")}</Title>
        <InfoRow label={t("invOps.item")} value={`${productName} · ${sku}`} />
        <InfoRow
          label={t("invOps.location")}
          value={locationName(props.locations, r.inventoryLocationId)}
        />
        {r.supplierId ? (
          <View testID="receive-supplier-result">
            <InfoRow
              label={t("invOps.supplier")}
              value={supplierLabel(props.supplierOptions, r.supplierId)}
            />
          </View>
        ) : null}
        {r.supplierReference ? (
          <InfoRow label={t("invOps.supplierReference")} value={r.supplierReference} />
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Body>{t("invOps.onHandNow")}</Body>
          <Badge label={String(r.observedOnHand)} testID="receive-observed-onhand" />
        </View>
      </SuccessPanel>
    );
  }

  return (
    <FormShell title={t("invOps.tabReceive")} hint={t("invOps.receiveHint")}>
      <SelectField
        label={t("invOps.item")}
        options={props.variantOptions}
        selected={variantId}
        onSelect={setVariantId}
        testIDPrefix="receive-variant"
        emptyLabel={t("invOps.noItemsVisible")}
      />
      <SelectField
        label={t("invOps.location")}
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
            label={t("invOps.supplierOptional")}
            options={supplierSelectOptions}
            selected={supplierId}
            onSelect={setSupplierId}
            testIDPrefix="receive-supplier"
          />
          {hasSupplier ? (
            <TextField
              label={t("invOps.supplierRefOptional")}
              value={supplierReference}
              onChangeText={setSupplierReference}
              placeholder={t("invOps.supplierRefPlaceholder")}
              testID="receive-supplier-reference"
              autoCapitalize="characters"
            />
          ) : null}
        </>
      ) : null}
      <NumberField
        label={t("invOps.quantityReceived")}
        value={quantity}
        onChangeText={setQuantity}
        placeholder={t("invOps.qtyPlaceholder5")}
        testID="receive-quantity"
      />
      <TextField
        label={t("invOps.noteOptional")}
        value={note}
        onChangeText={setNote}
        testID="receive-note"
      />
      {localError ? <Body>{localError}</Body> : null}
      {mutation.state.status === "error" ? (
        <WriteError state={mutation.state} mutation={mutation} />
      ) : null}
      {mutation.state.status === "blocked" ? (
        <BlockedNotice reason={mutation.state.reason} mutation={mutation} />
      ) : null}
      <PrimaryButton
        label={
          mutation.state.status === "submitting" ? t("invOps.receiving") : t("invOps.tabReceive")
        }
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

function AdjustForm(props: InventoryOperationsProps & { onStorageUnavailable?: () => void }) {
  const { t } = useI18n();
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
  });

  useRefreshOnSuccess(mutation.state, props.onRefresh);
  useReportStorageUnavailable(mutation.state, props.onStorageUnavailable);

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
        label: t("invOps.adjustRowLabel", {
          product: r.productName,
          sku: r.sku,
          location: locationName(props.locations, r.inventoryLocationId),
          onHand: r.onHand,
          version: r.version,
        }),
      })),
    [props.locations, rows, t],
  );

  function onSubmit() {
    const counted = Number(countedQuantity);
    const problem = !selectedRow
      ? t("invOps.chooseItemReconcile")
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
        resetLabel={t("invOps.newReconciliation")}
      >
        <Title>{r.changed ? t("invOps.stockReconciled") : t("invOps.countConfirmed")}</Title>
        <InfoRow label={t("invOps.previousOnHand")} value={String(r.previousOnHand)} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Body>{t("invOps.countedOnHand")}</Body>
          <Badge label={String(r.newOnHand)} testID="adjust-new-onhand" />
        </View>
      </SuccessPanel>
    );
  }

  return (
    <FormShell title={t("invOps.tabAdjust")} hint={t("invOps.adjustHint")}>
      {options.length === 0 ? (
        <Body>{t("invOps.noAdjustRows")}</Body>
      ) : (
        <>
          <SelectField
            label={t("invOps.itemToReconcile")}
            options={options}
            selected={selectedKey}
            onSelect={setSelectedKey}
            testIDPrefix="adjust-row"
          />
          <NumberField
            label={t("invOps.countedPhysicalQty")}
            value={countedQuantity}
            onChangeText={setCountedQuantity}
            placeholder={t("invOps.actualCountPlaceholder")}
            testID="adjust-counted"
          />
          <TextField
            label={t("invOps.noteOptional")}
            value={note}
            onChangeText={setNote}
            testID="adjust-note"
          />
          {localError ? <Body>{localError}</Body> : null}
          {mutation.state.status === "error" && !isConcurrencyConflict ? (
            <WriteError state={mutation.state} mutation={mutation} />
          ) : null}
          {mutation.state.status === "blocked" ? (
            <BlockedNotice reason={mutation.state.reason} mutation={mutation} />
          ) : null}
          <PrimaryButton
            label={
              mutation.state.status === "submitting"
                ? t("invOps.reconciling")
                : t("invOps.reconcileToCount")
            }
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
    onStorageUnavailable?: () => void;
  },
) {
  const { t } = useI18n();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useJournaledInventoryMutation<TransferInventoryResponse>({
    client: props.client,
    journal: props.journal,
  });

  useRefreshOnSuccess(mutation.state, props.onRefresh);
  useReportStorageUnavailable(mutation.state, props.onStorageUnavailable);

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
        ? t("invOps.chooseItemSourceDest")
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
        resetLabel={t("invOps.newTransfer")}
      >
        <Title>{t("invOps.stockTransferred")}</Title>
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
    <FormShell title={t("invOps.tabTransfer")} hint={t("invOps.transferHint")}>
      <SelectField
        label={t("invOps.item")}
        options={props.variantOptions}
        selected={variantId}
        onSelect={setVariantId}
        testIDPrefix="transfer-variant"
        emptyLabel={t("invOps.noItemsVisible")}
      />
      <SelectField
        label={t("invOps.fromSource")}
        options={props.sourceOptions}
        selected={sourceId}
        onSelect={setSourceId}
        testIDPrefix="transfer-source"
      />
      <SelectField
        label={t("invOps.toDestination")}
        options={destinationOptions}
        selected={destinationId}
        onSelect={setDestinationId}
        testIDPrefix="transfer-destination"
      />
      <NumberField
        label={t("invOps.quantityToMove")}
        value={quantity}
        onChangeText={setQuantity}
        placeholder={t("invOps.qtyPlaceholder3")}
        testID="transfer-quantity"
      />
      <TextField
        label={t("invOps.noteOptional")}
        value={note}
        onChangeText={setNote}
        testID="transfer-note"
      />
      {localError ? <Body>{localError}</Body> : null}
      {mutation.state.status === "error" ? (
        <WriteError state={mutation.state} mutation={mutation} />
      ) : null}
      {mutation.state.status === "blocked" ? (
        <BlockedNotice reason={mutation.state.reason} mutation={mutation} />
      ) : null}
      <PrimaryButton
        label={
          mutation.state.status === "submitting"
            ? t("invOps.transferring")
            : t("invOps.tabTransfer")
        }
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
    <FormSection title={title} description={hint} icon="clipboard-edit-outline">
      {children}
    </FormSection>
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
  const { t } = useI18n();
  return (
    <Surface tone="brand" testID={testID}>
      {children}
      <Notice tone="success" message={t("invOps.refreshedNotice")} />
      <PrimaryButton label={resetLabel} icon="plus" onPress={onReset} />
    </Surface>
  );
}
