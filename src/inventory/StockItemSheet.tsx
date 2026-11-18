import type {
  AdjustInventoryResponse,
  MeContextResponse,
  ReceiveInventoryResponse,
  TenantCommerceClient,
  TransferInventoryResponse,
} from "@shifted/clothing-commerce-sdk";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { classifyCommerceError } from "../commerce/errors";
import { OPERATING_CURRENCY } from "../commerce/currency";
import { formatMinorToInput, parseAmountToMinor } from "../catalog/money";
import { slugify } from "../catalog/operations";
import { describeCatalogWriteError } from "../catalog/write-errors";
import { directionalIcon, useI18n } from "../i18n";
import {
  Notice,
  NumberField,
  PrimaryButton,
  SelectField,
  type SelectOption,
  TextButton,
  TextField,
} from "../ui/components";
import { AppIcon, type AppIconName } from "../ui/Icon";
import { radius, shadows, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { secureIdempotencyKey } from "./idempotency";
import type { InventoryJournal } from "./journal/journal";
import {
  normalizeAdjustPayload,
  normalizeReceivePayload,
  normalizeTransferPayload,
} from "./journal/model";
import {
  useJournaledInventoryMutation,
  type JournaledMutation,
  type JournaledMutationState,
} from "./journal/useJournaledInventoryMutation";
import type { InventoryItem } from "./load";
import { validateCountedQuantity, validatePositiveQuantity } from "./operations";
import { describeInventoryWriteError } from "./write-errors";

/** A location the caller may act on, exactly as `/me/context` returns it. */
export type InventoryLocationRef = MeContextResponse["access"]["inventory"]["locations"][number];
export type InventoryWriteAccess = MeContextResponse["access"]["inventory"]["write"];
export type StockSheetAction = "edit" | "restock" | "count" | "transfer";

export interface StockItemSheetProps {
  /** The stock row the sheet acts on; null hides the sheet. */
  item: InventoryItem | null;
  client: TenantCommerceClient;
  journal: InventoryJournal;
  write: InventoryWriteAccess;
  /** Business can edit catalog details (name / price / cost / category). */
  canEditDetails: boolean;
  locationName: (id: string) => string;
  /** Active suppliers offered when restocking (optional link). */
  suppliers?: SelectOption[];
  /** False while the recovery journal is not ready: stock writes are hidden (fail closed). */
  writesAvailable: boolean;
  onClose: () => void;
  /** A change was saved — reload the authoritative stock list. */
  onChanged: () => void;
  /** Someone else changed this stock during a count — reload and ask for a recount. */
  onConcurrencyConflict: () => void;
  onStorageUnavailable: () => void;
  /** Open straight on one action instead of the menu (e.g. a deep link or a test). */
  initialAction?: StockSheetAction;
}

/**
 * Tap a stock row → this sheet. Same actions as the POS row menu: Edit details, Restock, Count and
 * Transfer, each already scoped to the tapped item and its location (no item pickers to fill in).
 */
export function StockItemSheet(props: StockItemSheetProps) {
  const { styles, colors } = useStyles();
  const { item } = props;
  const { t, dir } = useI18n();
  const insets = useSafeAreaInsets();

  // The parent remounts this sheet (via `key`) for every item it opens, so it always starts at the
  // action menu.
  const [action, setAction] = useState<StockSheetAction | null>(props.initialAction ?? null);

  if (!item) return null;
  const locationAccess = props.write.locations.find((l) => l.id === item.inventoryLocationId);
  const transferTargets = props.write.locations.filter(
    (l) => l.canTransferDestination && l.id !== item.inventoryLocationId,
  );
  const can = {
    edit: props.canEditDetails,
    restock: props.writesAvailable && props.write.canReceive && !!locationAccess?.canReceive,
    count: props.writesAvailable && props.write.canAdjust && !!locationAccess?.canAdjust,
    transfer:
      props.writesAvailable &&
      props.write.canTransfer &&
      !!locationAccess?.canTransferOrigin &&
      transferTargets.length > 0,
  };

  const close = () => {
    setAction(null);
    props.onClose();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.overlay} onPress={close} accessibilityLabel={t("common.cancel")}>
        <Pressable
          testID="stock-sheet"
          onPress={() => undefined}
          style={[styles.sheet, { direction: dir, paddingBottom: spacing.xl + insets.bottom }]}
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            {action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.back")}
                testID="stock-sheet-back"
                onPress={() => setAction(null)}
                style={styles.headerButton}
              >
                <AppIcon
                  name={directionalIcon("arrow-left", dir === "rtl")}
                  size={20}
                  color={colors.brand}
                />
              </Pressable>
            ) : null}
            <View style={styles.headerCopy}>
              <Text numberOfLines={2} style={styles.title}>
                {item.productName}
              </Text>
              <Text numberOfLines={1} style={styles.meta}>
                {item.sku} · {props.locationName(item.inventoryLocationId)}
              </Text>
            </View>
            <View style={styles.onHand}>
              <Text style={styles.onHandValue}>{item.onHand}</Text>
              <Text style={styles.onHandLabel}>{t("stock.inStock")}</Text>
            </View>
          </View>

          <ScrollView
            // On Android a ScrollView inside a content-sized sheet does not grow to its content and
            // clips it; size it by its content (up to the sheet's max height) instead.
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.body}
          >
            {action === null ? (
              <View style={styles.menu}>
                {can.edit ? (
                  <MenuItem
                    icon="pencil-outline"
                    label={t("stock.actionEdit")}
                    detail={t("stock.actionEditDetail")}
                    testID="stock-action-edit"
                    onPress={() => setAction("edit")}
                  />
                ) : null}
                {can.restock ? (
                  <MenuItem
                    icon="package-down"
                    label={t("stock.actionRestock")}
                    detail={t("stock.actionRestockDetail")}
                    testID="stock-action-restock"
                    onPress={() => setAction("restock")}
                  />
                ) : null}
                {can.count ? (
                  <MenuItem
                    icon="clipboard-check-outline"
                    label={t("stock.actionCount")}
                    detail={t("stock.actionCountDetail")}
                    testID="stock-action-count"
                    onPress={() => setAction("count")}
                  />
                ) : null}
                {can.transfer ? (
                  <MenuItem
                    icon="swap-horizontal"
                    label={t("stock.actionTransfer")}
                    detail={t("stock.actionTransferDetail")}
                    testID="stock-action-transfer"
                    onPress={() => setAction("transfer")}
                  />
                ) : null}
                {!can.edit && !can.restock && !can.count && !can.transfer ? (
                  <Notice message={t("stock.noActions")} />
                ) : null}
              </View>
            ) : null}
            {action === "restock" ? <RestockForm {...props} item={item} onDone={close} /> : null}
            {action === "count" ? <CountForm {...props} item={item} onDone={close} /> : null}
            {action === "transfer" ? (
              <TransferForm
                {...props}
                item={item}
                destinations={transferTargets.map((l) => ({ value: l.id, label: l.name }))}
                onDone={close}
              />
            ) : null}
            {action === "edit" ? <EditDetailsForm {...props} item={item} onDone={close} /> : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuItem({
  icon,
  label,
  detail,
  testID,
  onPress,
}: {
  icon: AppIconName;
  label: string;
  detail: string;
  testID: string;
  onPress: () => void;
}) {
  const { styles, colors } = useStyles();
  const { isRTL } = useI18n();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}
    >
      <View style={styles.menuIcon}>
        <AppIcon name={icon} size={22} color={colors.brand} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuLabel}>{label}</Text>
        <Text numberOfLines={2} style={styles.menuDetail}>
          {detail}
        </Text>
      </View>
      <AppIcon name={directionalIcon("chevron-right", isRTL)} size={20} color={colors.inkSubtle} />
    </Pressable>
  );
}

// ─── Shared helpers for the journaled stock forms ─────────────────────────────────────────────────

type FormProps = StockItemSheetProps & { item: InventoryItem; onDone: () => void };

/** On success: reload the list, confirm, close. On a durability failure: tell the parent once. */
function useSettled<T>(
  state: JournaledMutationState<T>,
  mutation: JournaledMutation<T>,
  props: FormProps,
) {
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    if (state.status === "success") {
      latest.current.onChanged();
      mutation.reset();
      latest.current.onDone();
    }
    if (state.status === "blocked" && state.reason === "storage-unavailable") {
      latest.current.onStorageUnavailable();
    }
    // `mutation` identity is stable per form; only state transitions matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

function WriteFeedback<T>({ mutation }: { mutation: JournaledMutation<T> }) {
  const { t } = useI18n();
  const state = mutation.state;
  if (state.status === "blocked") {
    return (
      <Notice
        testID={
          state.reason === "pending-equivalent"
            ? "write-blocked-equivalent"
            : "write-blocked-storage"
        }
        tone="warning"
        title={
          state.reason === "pending-equivalent"
            ? t("invOps.blockedEquivTitle")
            : t("invOps.storagePausedTitle")
        }
        message={
          state.reason === "pending-equivalent"
            ? t("invOps.blockedEquivMsg")
            : t("invOps.blockedStorageMsg")
        }
        action={<TextButton label={t("common.dismiss")} onPress={() => mutation.reset()} />}
      />
    );
  }
  if (state.status !== "error") return null;
  const described = describeInventoryWriteError(state.error);
  if (described.isConcurrencyConflict) return null; // handled by the parent's refresh-and-recount
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
        ) : (
          <TextButton
            label={described.recovery === "edit" ? t("stock.edit") : t("common.dismiss")}
            onPress={() => mutation.reset()}
          />
        )
      }
    />
  );
}

// ─── Restock (receive more of this exact item) ────────────────────────────────────────────────────

const NO_SUPPLIER = "";

function RestockForm(props: FormProps) {
  const { t } = useI18n();
  const { item } = props;
  const [quantity, setQuantity] = useState("");
  const [supplierId, setSupplierId] = useState<string>(NO_SUPPLIER);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useJournaledInventoryMutation<ReceiveInventoryResponse>({
    client: props.client,
    journal: props.journal,
  });
  useSettled(mutation.state, mutation, props);

  const suppliers = props.suppliers ?? [];
  const hasSupplier = suppliers.length > 0 && supplierId !== NO_SUPPLIER;

  function submit() {
    const qty = Number(quantity);
    const problem = validatePositiveQuantity(qty);
    setError(problem);
    if (problem) return;
    mutation.submit(
      normalizeReceivePayload({
        variantId: item.variantId,
        inventoryLocationId: item.inventoryLocationId,
        quantity: qty,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(hasSupplier ? { supplierId } : {}),
        ...(hasSupplier && reference.trim() ? { supplierReference: reference.trim() } : {}),
      }),
    );
  }

  return (
    <FormBody hint={t("stock.restockHint")}>
      <NumberField
        label={t("stock.quantityReceived")}
        value={quantity}
        onChangeText={setQuantity}
        placeholder="0"
        testID="restock-quantity"
        error={error}
        required
      />
      {suppliers.length > 0 ? (
        <>
          <SelectField
            label={t("stock.supplierOptional")}
            options={[{ value: NO_SUPPLIER, label: t("invOps.noSupplier") }, ...suppliers]}
            selected={supplierId}
            onSelect={setSupplierId}
            testIDPrefix="restock-supplier"
          />
          {hasSupplier ? (
            <TextField
              label={t("invOps.supplierRefOptional")}
              value={reference}
              onChangeText={setReference}
              placeholder={t("invOps.supplierRefPlaceholder")}
              autoCapitalize="characters"
              testID="restock-reference"
            />
          ) : null}
        </>
      ) : null}
      <TextField
        label={t("invOps.noteOptional")}
        value={note}
        onChangeText={setNote}
        testID="restock-note"
      />
      <WriteFeedback mutation={mutation} />
      <PrimaryButton
        testID="restock-submit"
        icon="package-down"
        label={
          mutation.state.status === "submitting" ? t("receive.saving") : t("stock.restockSubmit")
        }
        disabled={mutation.state.status === "submitting"}
        onPress={submit}
      />
    </FormBody>
  );
}

// ─── Count (set the real quantity on the shelf) ───────────────────────────────────────────────────

function CountForm(props: FormProps) {
  const { t } = useI18n();
  const { item } = props;
  const [counted, setCounted] = useState(String(item.onHand));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useJournaledInventoryMutation<AdjustInventoryResponse>({
    client: props.client,
    journal: props.journal,
  });
  useSettled(mutation.state, mutation, props);

  const isConflict =
    mutation.state.status === "error" &&
    describeInventoryWriteError(mutation.state.error).isConcurrencyConflict;
  const onConflict = props.onConcurrencyConflict;
  useEffect(() => {
    if (isConflict) onConflict();
  }, [isConflict, onConflict]);

  function submit() {
    const value = Number(counted);
    const problem = validateCountedQuantity(value);
    setError(problem);
    if (problem) return;
    mutation.submit(
      normalizeAdjustPayload({
        variantId: item.variantId,
        inventoryLocationId: item.inventoryLocationId,
        countedQuantity: value,
        expectedVersion: item.version,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    );
  }

  return (
    <FormBody hint={t("stock.countHint", { count: item.onHand })}>
      <NumberField
        label={t("stock.countedQuantity")}
        value={counted}
        onChangeText={setCounted}
        testID="count-quantity"
        error={error}
        required
      />
      <TextField
        label={t("invOps.noteOptional")}
        value={note}
        onChangeText={setNote}
        testID="count-note"
      />
      <WriteFeedback mutation={mutation} />
      <PrimaryButton
        testID="count-submit"
        icon="clipboard-check-outline"
        label={
          mutation.state.status === "submitting" ? t("receive.saving") : t("stock.countSubmit")
        }
        disabled={mutation.state.status === "submitting"}
        onPress={submit}
      />
    </FormBody>
  );
}

// ─── Transfer (move to another location) ──────────────────────────────────────────────────────────

function TransferForm(props: FormProps & { destinations: SelectOption[] }) {
  const { t } = useI18n();
  const { item } = props;
  const [destinationId, setDestinationId] = useState<string | null>(
    props.destinations[0]?.value ?? null,
  );
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mutation = useJournaledInventoryMutation<TransferInventoryResponse>({
    client: props.client,
    journal: props.journal,
  });
  useSettled(mutation.state, mutation, props);

  function submit() {
    const qty = Number(quantity);
    const problem = !destinationId ? t("stock.chooseDestination") : validatePositiveQuantity(qty);
    setError(problem);
    if (problem || !destinationId) return;
    mutation.submit(
      normalizeTransferPayload({
        variantId: item.variantId,
        sourceInventoryLocationId: item.inventoryLocationId,
        destinationInventoryLocationId: destinationId,
        quantity: qty,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    );
  }

  return (
    <FormBody
      hint={t("stock.transferHint", { location: props.locationName(item.inventoryLocationId) })}
    >
      <SelectField
        label={t("stock.moveTo")}
        options={props.destinations}
        selected={destinationId}
        onSelect={setDestinationId}
        testIDPrefix="transfer-destination"
      />
      <NumberField
        label={t("stock.quantityToMove")}
        value={quantity}
        onChangeText={setQuantity}
        placeholder="0"
        testID="transfer-quantity"
        error={error}
        required
      />
      <TextField
        label={t("invOps.noteOptional")}
        value={note}
        onChangeText={setNote}
        testID="transfer-note"
      />
      <WriteFeedback mutation={mutation} />
      <PrimaryButton
        testID="transfer-submit"
        icon="swap-horizontal"
        label={
          mutation.state.status === "submitting" ? t("receive.saving") : t("stock.transferSubmit")
        }
        disabled={mutation.state.status === "submitting"}
        onPress={submit}
      />
    </FormBody>
  );
}

// ─── Edit details (name, price, cost, category — as in the POS) ───────────────────────────────────

interface Category {
  id: string;
  name: string;
  productIds: string[];
}

function EditDetailsForm(props: FormProps) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const { item, client } = props;
  const [name, setName] = useState(item.productName);
  const [price, setPrice] = useState(
    item.sellingPriceMinor != null ? formatMinorToInput(item.sellingPriceMinor) : "",
  );
  const [cost, setCost] = useState(
    item.unitCostMinor != null ? formatMinorToInput(item.unitCostMinor) : "",
  );
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{ heading: string; message: string } | null>(null);

  // Categories are collections. Load them with their members to know which one holds this product.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const list = await client.listCollections();
        const details = await Promise.all(
          list.collections
            .filter((c) => c.status !== "archived")
            .map(async (c) => {
              const detail = await client.getCollection(c.id);
              return { id: c.id, name: c.name, productIds: detail.productIds };
            }),
        );
        if (!active) return;
        setCategories(details);
        setCategoryId(details.find((c) => c.productIds.includes(item.productId))?.id ?? "");
      } catch {
        if (active) setCategories([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [client, item.productId]);

  const originalCategoryIds = useMemo(
    () => (categories ?? []).filter((c) => c.productIds.includes(item.productId)).map((c) => c.id),
    [categories, item.productId],
  );

  async function save() {
    const trimmed = name.trim();
    if (!trimmed)
      return setError({ heading: t("errorHead.validation"), message: t("receive.errName") });
    const priceParsed = parseAmountToMinor(price);
    if (!priceParsed.ok || priceParsed.amountMinor <= 0) {
      return setError({ heading: t("errorHead.validation"), message: t("receive.errPrice") });
    }
    const costParsed = cost.trim() ? parseAmountToMinor(cost) : null;
    if (costParsed && (!costParsed.ok || costParsed.amountMinor < 0)) {
      return setError({ heading: t("errorHead.validation"), message: t("receive.errCost") });
    }
    setError(null);
    setSaving(true);
    try {
      if (trimmed !== item.productName) {
        await client.updateProduct({
          idempotencyKey: secureIdempotencyKey(),
          productId: item.productId,
          name: trimmed,
          // The current web address can't be read back, so (like the POS) a new unique one is made
          // from the new name.
          slug: `${slugify(trimmed) || "product"}-${secureIdempotencyKey()
            .replace(/[^a-z0-9]/gi, "")
            .slice(-4)
            .toLowerCase()}`,
        });
      }
      if (priceParsed.amountMinor !== item.sellingPriceMinor) {
        await client.setVariantPrice({
          idempotencyKey: secureIdempotencyKey(),
          variantId: item.variantId,
          currency: OPERATING_CURRENCY,
          amountMinor: priceParsed.amountMinor,
        });
      }
      if (costParsed && costParsed.ok && costParsed.amountMinor !== item.unitCostMinor) {
        await client.setVariantCost({
          idempotencyKey: secureIdempotencyKey(),
          variantId: item.variantId,
          unitCostMinor: costParsed.amountMinor,
        });
      }
      if (
        categories &&
        !(categoryId === ""
          ? originalCategoryIds.length === 0
          : originalCategoryIds.length === 1 && originalCategoryIds[0] === categoryId)
      ) {
        // Single-category model (as in the POS): leave every other category, join the chosen one.
        for (const c of categories) {
          const member = c.productIds.includes(item.productId);
          const wanted = c.id === categoryId;
          if (member === wanted) continue;
          await client.setCollectionProducts({
            idempotencyKey: secureIdempotencyKey(),
            collectionId: c.id,
            productIds: wanted
              ? [...c.productIds, item.productId]
              : c.productIds.filter((id) => id !== item.productId),
          });
        }
      }
      props.onChanged();
      props.onDone();
    } catch (err) {
      const described = describeCatalogWriteError(classifyCommerceError(err));
      setError({ heading: described.heading, message: described.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormBody hint={t("stock.editHint")}>
      <TextField
        label={t("receive.name")}
        value={name}
        onChangeText={setName}
        testID="edit-name"
        required
      />
      <View style={styles.twoCol}>
        <View style={styles.col}>
          <TextField
            label={t("receive.price", { currency: OPERATING_CURRENCY })}
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            testID="edit-price"
            required
          />
        </View>
        <View style={styles.col}>
          <TextField
            label={t("receive.cost", { currency: OPERATING_CURRENCY })}
            value={cost}
            onChangeText={setCost}
            placeholder="0.00"
            testID="edit-cost"
          />
        </View>
      </View>
      {categories ? (
        <SelectField
          label={t("receive.category")}
          options={[
            { value: "", label: t("receive.noCategory") },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
          selected={categoryId}
          onSelect={setCategoryId}
          testIDPrefix="edit-category"
        />
      ) : (
        <Text style={styles.hint}>{t("common.loading")}</Text>
      )}
      {error ? (
        <Notice testID="edit-error" tone="danger" title={error.heading} message={error.message} />
      ) : null}
      <PrimaryButton
        testID="edit-submit"
        icon="content-save-outline"
        label={saving ? t("receive.saving") : t("common.saveChanges")}
        disabled={saving}
        onPress={() => void save()}
      />
    </FormBody>
  );
}

function FormBody({ hint, children }: { hint: string; children: ReactNode }) {
  const { styles } = useStyles();
  return (
    <View style={styles.form}>
      <Text style={styles.hint}>{hint}</Text>
      {children}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim },
    sheet: {
      maxHeight: "88%",
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
      paddingTop: spacing.sm,
      paddingHorizontal: spacing.xl,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      backgroundColor: colors.surface,
      ...shadows.raised,
    },
    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.borderStrong,
      marginBottom: spacing.md,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSoft,
    },
    headerButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    headerCopy: { flex: 1, minWidth: 0, gap: 2 },
    title: { color: colors.ink, ...typography.sectionTitle },
    meta: { color: colors.inkMuted, ...typography.caption },
    onHand: { alignItems: "center", minWidth: 56 },
    onHandValue: { color: colors.ink, ...typography.metric },
    onHandLabel: { color: colors.inkSubtle, ...typography.micro },
    scroll: { flexGrow: 0, flexShrink: 1 },
    body: { paddingTop: spacing.lg, gap: spacing.md },
    menu: { gap: spacing.sm },
    menuItem: {
      minHeight: 64,
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceRaised,
    },
    menuIcon: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    menuCopy: { flex: 1, minWidth: 0, gap: 2 },
    menuLabel: { color: colors.ink, ...typography.cardTitle },
    menuDetail: { color: colors.inkMuted, ...typography.caption },
    form: { gap: spacing.md },
    hint: { color: colors.inkMuted, ...typography.bodySmall },
    twoCol: { flexDirection: "row", gap: spacing.md },
    col: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.85 },
  });
  return { colors, styles };
});
