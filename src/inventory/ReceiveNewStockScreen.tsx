import type { MeContextResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { classifyCommerceError } from "../commerce/errors";
import { OPERATING_CURRENCY } from "../commerce/currency";
import { parseAmountToMinor } from "../catalog/money";
import { describeCatalogWriteError } from "../catalog/write-errors";
import { useI18n } from "../i18n";
import { useSession } from "../session/SessionProvider";
import {
  FormSection,
  Notice,
  NumberField,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  type SelectOption,
  TextButton,
  TextField,
  Toggle,
} from "../ui/components";
import { AppIcon } from "../ui/Icon";
import { useToast } from "../ui/Toast";
import { radius, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "./idempotency";
import {
  APPAREL_SIZES,
  buildVariants,
  createStepKeys,
  emptyProgress,
  NewStockStepError,
  runReceiveNewStock,
  SHOE_SIZES,
  skuToken,
  type NewStockClient,
  type NewStockProgress,
  type NewStockStep,
} from "./receive-new-stock";
import { useInventoryJournal } from "./useInventoryJournal";
import { describeInventoryWriteError } from "./write-errors";

export interface ReceiveNewStockScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onDone: () => void;
  onBack: () => void;
  /** Test seams. */
  client?: NewStockClient &
    Pick<
      TenantCommerceClient,
      "listCollections" | "createCollection" | "setCollectionStatus" | "createBrand"
    >;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

interface Option {
  id: string;
  name: string;
}

/**
 * Receive new stock — the POS "Add product" desk on mobile. One form creates the item, its sizes with
 * their opening quantities, price, cost, category and optional online listing.
 */
export function ReceiveNewStockScreen(props: ReceiveNewStockScreenProps) {
  const { styles } = useStyles();
  const { tenantId, context, onDone, onBack } = props;
  const { t } = useI18n();
  const toast = useToast();
  const { getTenantClient } = useSession();
  const client = props.client ?? getTenantClient(tenantId);
  const { journal } = useInventoryJournal(tenantId, context);

  const canReceive = context.access.inventory.write.canReceive;
  const locationOptions = useMemo<SelectOption[]>(
    () =>
      context.access.inventory.write.locations
        .filter((location) => location.canReceive)
        .map((location) => ({ value: location.id, label: location.name })),
    [context.access.inventory.write.locations],
  );

  // ── Brands (pick one or add a new one, like the POS) ───────────────────────────────────────────
  const [brands, setBrands] = useState<Option[]>(() =>
    context.access.catalog.brands.map((b) => ({ id: b.id, name: b.name })),
  );
  const [brandId, setBrandId] = useState<string | null>(brands[0]?.id ?? null);
  const [newBrand, setNewBrand] = useState("");
  const [addingBrand, setAddingBrand] = useState(false);

  // ── Categories (collections) ────────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Option[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  useEffect(() => {
    let active = true;
    client
      .listCollections()
      .then((response) => {
        if (!active) return;
        setCategories(
          response.collections
            .filter((c) => c.status !== "archived")
            .map((c) => ({ id: c.id, name: c.name })),
        );
      })
      // Categories are optional; if they can't load the item can still be received without one.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client]);

  // ── Item fields ─────────────────────────────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [styleCode, setStyleCode] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [locationId, setLocationId] = useState<string | null>(locationOptions[0]?.value ?? null);
  const [publish, setPublish] = useState(false);

  // ── Sizes ───────────────────────────────────────────────────────────────────────────────────────
  const [apparel, setApparel] = useState<string[]>([...APPAREL_SIZES]);
  const [shoes, setShoes] = useState<string[]>([...SHOE_SIZES]);
  const [selected, setSelected] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [standardQty, setStandardQty] = useState("");
  const [customSize, setCustomSize] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [stepLabel, setStepLabel] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ heading: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Resumable progress + per-step keys survive across "Try again" presses for this one item.
  const generate = props.generateIdempotencyKey ?? secureIdempotencyKey;
  const progressRef = useRef<NewStockProgress>(emptyProgress());
  const keysRef = useRef(createStepKeys(generate));
  // True once the item exists on the service: its details are then locked so a retry finishes it.
  const [started, setStarted] = useState(false);

  function toggleSize(size: string) {
    setSelected((current) =>
      current.includes(size) ? current.filter((s) => s !== size) : [...current, size],
    );
    setQty((current) => ({ ...current, [size]: current[size] ?? "1" }));
  }

  function addCustomSize() {
    const size = customSize.trim().toUpperCase();
    if (!size) return;
    const isShoe = /^\d+([.,]\d+)?$/.test(size);
    if (isShoe) {
      if (!shoes.includes(size)) setShoes([...shoes, size]);
    } else if (!apparel.includes(size)) {
      setApparel([...apparel, size]);
    }
    if (!selected.includes(size)) setSelected([...selected, size]);
    setQty((current) => ({ ...current, [size]: current[size] ?? "1" }));
    setCustomSize("");
  }

  // Keep the selected sizes in the order they appear in the grid (XS→XXXL, then 36→44).
  const orderedSizes = useMemo(
    () => [...apparel, ...shoes].filter((size) => selected.includes(size)),
    [apparel, shoes, selected],
  );
  const parsedQty = (value: string | undefined) => {
    const n = Number.parseInt(value ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const totalUnits =
    orderedSizes.length > 0
      ? orderedSizes.reduce((sum, size) => sum + parsedQty(qty[size]), 0)
      : parsedQty(standardQty);
  const skuPreview = skuToken(styleCode) || skuToken(name) || "ITEM";

  async function addBrand() {
    const label = newBrand.trim();
    if (!label) return;
    setAddingBrand(true);
    setFormError(null);
    try {
      const code = `${skuToken(label) || "BRAND"}-${generate()
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-4)
        .toUpperCase()}`;
      const created = await client.createBrand({
        idempotencyKey: generate(),
        code,
        displayName: label,
      });
      setBrands((current) => [...current, { id: created.id, name: label }]);
      setBrandId(created.id);
      setNewBrand("");
    } catch (error) {
      setFormError(describeCatalogWriteError(classifyCommerceError(error)).message);
    } finally {
      setAddingBrand(false);
    }
  }

  async function addCategory() {
    const label = newCategory.trim();
    if (!label) return;
    setAddingCategory(true);
    setFormError(null);
    try {
      const suffix = generate()
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-4)
        .toLowerCase();
      const base = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const created = await client.createCollection({
        idempotencyKey: generate(),
        name: label,
        slug: `${base || "category"}-${suffix}`,
      });
      // New collections start as drafts; activate so the category can be used straight away.
      if (created.status !== "active") {
        await client.setCollectionStatus({
          idempotencyKey: generate(),
          collectionId: created.collectionId,
          status: "active",
        });
      }
      setCategories((current) => [...current, { id: created.collectionId, name: label }]);
      setCategoryId(created.collectionId);
      setNewCategory("");
    } catch (error) {
      setFormError(describeCatalogWriteError(classifyCommerceError(error)).message);
    } finally {
      setAddingCategory(false);
    }
  }

  const describeStep = useCallback(
    (step: NewStockStep) => {
      switch (step.kind) {
        case "product":
          return t("receive.progressProduct");
        case "variant":
          return t("receive.progressSize", { sku: step.sku });
        case "stock":
          return t("receive.progressStock", { sku: step.sku });
        case "category":
          return t("receive.progressCategory");
        case "publish":
          return t("receive.progressPublish");
      }
    },
    [t],
  );

  function validate(): string | null {
    if (!name.trim()) return t("receive.errName");
    if (!brandId) return t("receive.errBrand");
    const priceParsed = parseAmountToMinor(price);
    if (!priceParsed.ok || priceParsed.amountMinor <= 0) return t("receive.errPrice");
    if (cost.trim()) {
      const costParsed = parseAmountToMinor(cost);
      if (!costParsed.ok || costParsed.amountMinor < 0) return t("receive.errCost");
    }
    if (totalUnits > 0 && !locationId) return t("receive.errLocation");
    return null;
  }

  async function submit() {
    if (busy) return;
    const problem = validate();
    setFormError(problem);
    if (problem || !brandId) return;
    const priceParsed = parseAmountToMinor(price);
    const costParsed = cost.trim() ? parseAmountToMinor(cost) : null;
    if (!priceParsed.ok) return;

    const sizes = orderedSizes.map((size) => ({ size, quantity: parsedQty(qty[size]) }));
    setBusy(true);
    setFailure(null);
    try {
      const result = await runReceiveNewStock({
        client,
        journal,
        progress: progressRef.current,
        keyFor: keysRef.current,
        onStep: (step) => setStepLabel(describeStep(step)),
        plan: {
          brandId,
          name: name.trim(),
          ...(styleCode.trim() ? { styleCode: styleCode.trim() } : {}),
          currency: OPERATING_CURRENCY,
          priceMinor: priceParsed.amountMinor,
          costMinor: costParsed && costParsed.ok ? costParsed.amountMinor : null,
          inventoryLocationId: locationId ?? "",
          variants: buildVariants(name, styleCode, sizes, parsedQty(standardQty)),
          categoryId: categoryId || null,
          publish,
        },
      });
      if (result.publishError) {
        toast.show({
          tone: "warning",
          title: t("receive.createdNotListed", { name: name.trim() }),
          message: describeCatalogWriteError(result.publishError).message,
        });
      } else {
        toast.success(t("receive.done", { name: name.trim(), count: result.totalUnits }));
      }
      onDone();
    } catch (error) {
      if (error instanceof NewStockStepError) {
        const described =
          error.step.kind === "stock"
            ? describeInventoryWriteError(error.error)
            : describeCatalogWriteError(error.error);
        setFailure({ heading: described.heading, message: described.message });
      } else {
        setFailure({ heading: t("errorHead.unknown"), message: t("err.unknown") });
      }
    } finally {
      setStarted(progressRef.current.productId !== undefined);
      setBusy(false);
      setStepLabel(null);
    }
  }

  if (!canReceive || locationOptions.length === 0) {
    return (
      <ScrollScreen>
        <PageHeader title={t("receive.title")} icon="package-variant-plus" onBack={onBack} />
        <Notice
          tone="warning"
          title={t("receive.noAccessTitle")}
          message={t("receive.noAccessBody")}
        />
      </ScrollScreen>
    );
  }

  const brandOptions: SelectOption[] = brands.map((b) => ({ value: b.id, label: b.name }));
  const categoryOptions: SelectOption[] = [
    { value: "", label: t("receive.noCategory") },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];
  // Once the item exists, its details are locked so "Try again" finishes the SAME item.
  const locked = started || busy;

  return (
    <ScrollScreen>
      <PageHeader title={t("receive.title")} icon="package-variant-plus" onBack={onBack} />

      <FormSection title={t("receive.sectionItem")} icon="tag-outline">
        <TextField
          label={t("receive.name")}
          value={name}
          onChangeText={locked ? () => undefined : setName}
          placeholder={t("receive.namePlaceholder")}
          testID="receive-name"
          required
        />
        <SelectField
          label={t("receive.brand")}
          options={brandOptions}
          selected={brandId}
          onSelect={locked ? () => undefined : setBrandId}
          testIDPrefix="receive-brand"
          emptyLabel={t("receive.noBrands")}
          required
        />
        {!locked ? (
          <InlineAdd
            value={newBrand}
            onChange={setNewBrand}
            onAdd={() => void addBrand()}
            busy={addingBrand}
            placeholder={t("receive.newBrand")}
            label={t("receive.add")}
            testID="receive-new-brand"
          />
        ) : null}
        <TextField
          label={t("receive.styleCode")}
          value={styleCode}
          onChangeText={locked ? () => undefined : setStyleCode}
          placeholder={t("receive.styleCodePlaceholder")}
          autoCapitalize="characters"
          hint={t("receive.skuHint", { sku: skuPreview })}
          testID="receive-style"
        />
        <SelectField
          label={t("receive.category")}
          options={categoryOptions}
          selected={categoryId}
          onSelect={locked ? () => undefined : setCategoryId}
          testIDPrefix="receive-category"
        />
        {!locked ? (
          <InlineAdd
            value={newCategory}
            onChange={setNewCategory}
            onAdd={() => void addCategory()}
            busy={addingCategory}
            placeholder={t("receive.newCategory")}
            label={t("receive.add")}
            testID="receive-new-category"
          />
        ) : null}
      </FormSection>

      <FormSection title={t("receive.sectionPrice")} icon="cash">
        <View style={styles.twoCol}>
          <View style={styles.col}>
            <TextField
              label={t("receive.price", { currency: OPERATING_CURRENCY })}
              value={price}
              onChangeText={locked ? () => undefined : setPrice}
              placeholder="0.00"
              testID="receive-price"
              required
            />
          </View>
          <View style={styles.col}>
            <TextField
              label={t("receive.cost", { currency: OPERATING_CURRENCY })}
              value={cost}
              onChangeText={locked ? () => undefined : setCost}
              placeholder="0.00"
              testID="receive-cost"
            />
          </View>
        </View>
      </FormSection>

      <FormSection
        title={t("receive.sectionSizes")}
        description={t("receive.sizesHint")}
        icon="ruler"
      >
        <SizeGroup
          title={t("receive.clothingSizes")}
          sizes={apparel}
          selected={selected}
          onToggle={locked ? () => undefined : toggleSize}
        />
        <SizeGroup
          title={t("receive.shoeSizes")}
          sizes={shoes}
          selected={selected}
          onToggle={locked ? () => undefined : toggleSize}
        />
        {!locked ? (
          <InlineAdd
            value={customSize}
            onChange={setCustomSize}
            onAdd={addCustomSize}
            placeholder={t("receive.customSize")}
            label={t("receive.add")}
            testID="receive-custom-size"
          />
        ) : null}

        {orderedSizes.length > 0 ? (
          <View style={styles.qtyList}>
            {orderedSizes.map((size) => (
              <View key={size} style={styles.qtyRow}>
                <Text style={styles.qtySize}>{size}</Text>
                <Stepper
                  value={qty[size] ?? "0"}
                  onChange={(value) => !locked && setQty((c) => ({ ...c, [size]: value }))}
                  testID={`receive-qty-${size}`}
                  label={t("receive.qtyFor", { size })}
                />
              </View>
            ))}
          </View>
        ) : (
          <NumberField
            label={t("receive.standardQty")}
            value={standardQty}
            onChangeText={locked ? () => undefined : setStandardQty}
            placeholder="0"
            testID="receive-standard-qty"
          />
        )}
        <Text testID="receive-total" style={styles.total}>
          {t("receive.totalUnits", { count: totalUnits })}
        </Text>
      </FormSection>

      <FormSection title={t("receive.sectionWhere")} icon="map-marker-outline">
        <SelectField
          label={t("receive.location")}
          options={locationOptions}
          selected={locationId}
          onSelect={locked ? () => undefined : setLocationId}
          testIDPrefix="receive-location"
        />
        <Toggle
          value={publish}
          onValueChange={locked ? () => undefined : setPublish}
          label={t("receive.publish")}
          description={t("receive.publishHint")}
          testID="receive-publish"
        />
      </FormSection>

      {formError ? <Notice testID="receive-form-error" tone="warning" message={formError} /> : null}
      {failure ? (
        <Notice
          testID="receive-failure"
          tone="danger"
          title={failure.heading}
          message={started ? `${failure.message} ${t("receive.resumeHint")}` : failure.message}
        />
      ) : null}
      {stepLabel ? <Notice testID="receive-progress" message={stepLabel} /> : null}

      <PrimaryButton
        testID="receive-submit"
        icon={started ? "refresh" : "package-variant-plus"}
        label={busy ? t("receive.saving") : started ? t("receive.finish") : t("receive.submit")}
        disabled={busy}
        onPress={() => void submit()}
      />
      {!started ? <TextButton label={t("common.cancel")} onPress={onBack} /> : null}
    </ScrollScreen>
  );
}

function SizeGroup({
  title,
  sizes,
  selected,
  onToggle,
}: {
  title: string;
  sizes: string[];
  selected: string[];
  onToggle: (size: string) => void;
}) {
  const { styles } = useStyles();
  return (
    <View style={styles.sizeGroup}>
      <Text style={styles.sizeGroupTitle}>{title}</Text>
      <View style={styles.sizeGrid}>
        {sizes.map((size) => {
          const active = selected.includes(size);
          return (
            <Pressable
              key={size}
              testID={`receive-size-${size}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => onToggle(size)}
              style={({ pressed }) => [
                styles.sizeChip,
                active && styles.sizeChipActive,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.sizeChipText, active && styles.sizeChipTextActive]}>{size}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Stepper({
  value,
  onChange,
  testID,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  testID: string;
  label: string;
}) {
  const { styles, colors } = useStyles();
  const n = Number.parseInt(value, 10) || 0;
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="−"
        testID={`${testID}-minus`}
        onPress={() => onChange(String(Math.max(0, n - 1)))}
        style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
      >
        <AppIcon name="minus" size={18} color={colors.brand} />
      </Pressable>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        inputMode="numeric"
        style={styles.stepperInput}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="+"
        testID={`${testID}-plus`}
        onPress={() => onChange(String(n + 1))}
        style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
      >
        <AppIcon name="plus" size={18} color={colors.brand} />
      </Pressable>
    </View>
  );
}

function InlineAdd({
  value,
  onChange,
  onAdd,
  busy,
  placeholder,
  label,
  testID,
}: {
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  busy?: boolean;
  placeholder: string;
  label: string;
  testID: string;
}) {
  const { styles, colors } = useStyles();
  return (
    <View style={styles.inlineAdd}>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChange}
        onSubmitEditing={onAdd}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSubtle}
        style={styles.inlineInput}
      />
      <Pressable
        testID={`${testID}-add`}
        accessibilityRole="button"
        disabled={busy || value.trim() === ""}
        onPress={onAdd}
        style={({ pressed }) => [
          styles.inlineButton,
          (busy || value.trim() === "") && styles.inlineButtonDisabled,
          pressed && styles.pressed,
        ]}
      >
        <AppIcon name="plus" size={16} color={colors.brand} />
        <Text style={styles.inlineButtonText}>{label}</Text>
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    twoCol: { flexDirection: "row", gap: spacing.md },
    col: { flex: 1, minWidth: 0 },
    sizeGroup: { gap: spacing.sm },
    sizeGroupTitle: { color: colors.inkMuted, ...typography.label },
    sizeGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    sizeChip: {
      minWidth: 48,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceRaised,
    },
    sizeChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    sizeChipText: { color: colors.ink, ...typography.label },
    sizeChipTextActive: { color: colors.onBrand },
    qtyList: { gap: spacing.sm },
    qtyRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    qtySize: { color: colors.ink, ...typography.cardTitle },
    stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    stepperButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    stepperInput: {
      width: 56,
      height: 40,
      textAlign: "center",
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radius.md,
      color: colors.ink,
      backgroundColor: colors.surfaceRaised,
      fontSize: 16,
      fontWeight: "700",
    },
    total: { color: colors.inkMuted, ...typography.label },
    inlineAdd: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
    inlineInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      color: colors.ink,
      backgroundColor: colors.surfaceRaised,
      fontSize: 16,
    },
    inlineButton: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    inlineButtonDisabled: { opacity: 0.5 },
    inlineButtonText: { color: colors.brand, ...typography.label },
    pressed: { opacity: 0.8 },
  });
  return { colors, styles };
});
