import type {
  CategoryListResponse,
  ProductDetailResponse,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  cleanOptionEntries,
  isColourName,
  normalizeSwatchHex,
  setProductCategories,
  setVariantOptions,
  updateOptionValues,
  type VariantOptionEntry,
} from "../catalog/operations";
import { useI18n } from "../i18n";
import type { IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  Checkbox,
  Eyebrow,
  LoadingBlock,
  Notice,
  PrimaryButton,
  SectionHeading,
  SelectField,
  TextButton,
  TextField,
} from "../ui/components";
import { radius, spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import { createThemedStyles } from "../ui/useTheme";
import { CatalogWriteError, useOnSuccess } from "./catalog-write-ui";

/**
 * Website-facing product structure (SDK 0.44): each variant's option values (Size, Colour…), colour
 * swatches for the Storefront, and the product's categories. All writes go through the SDK with an
 * idempotency key and re-read the product on success; the server validates and authorizes everything.
 */

interface SectionProps {
  client: TenantCommerceClient;
  data: ProductDetailResponse;
  generateKey: IdempotencyKeyFactory;
  reload: () => void;
}

/** Quick swatch picks; any #rrggbb can still be typed. */
const PRESET_SWATCHES = [
  "#1a1a1a",
  "#f5f5f0",
  "#9a9a96",
  "#1f2a44",
  "#2b3a67",
  "#8fb3d9",
  "#5a3a28",
  "#b58a5a",
  "#c8a165",
  "#e8dcc8",
  "#3f5e3a",
  "#a23f2d",
  "#e5322d",
  "#f2b5c4",
];

/** Default dimension names offered on a product that has no options yet. */
const DEFAULT_OPTION_NAMES = ["Size", "Colour"];

export function optionRowsFor(
  data: ProductDetailResponse,
  variantId: string | null,
): VariantOptionEntry[] {
  const names = data.options.length > 0 ? data.options.map((o) => o.name) : DEFAULT_OPTION_NAMES;
  const variant = data.variants.find((v) => v.id === variantId);
  return names.map((name) => {
    const option = data.options.find((o) => o.name === name);
    const selected = variant?.optionValues?.find((entry) => entry.optionId === option?.id);
    const value = option?.values.find((v) => v.id === selected?.valueId)?.value ?? "";
    return { name, value };
  });
}

/**
 * Editable name/value rows. Names prefill from the product's existing dimensions so admins usually only
 * type values; "Add option" appends a row (max 3, like the server).
 */
export function OptionRowsField({
  rows,
  onChange,
  testIDPrefix,
}: {
  rows: VariantOptionEntry[];
  onChange: (rows: VariantOptionEntry[]) => void;
  testIDPrefix: string;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const set = (index: number, patch: Partial<VariantOptionEntry>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <View style={styles.rows}>
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          <View style={styles.rowField}>
            <TextField
              label={t("po.optionName")}
              value={row.name}
              onChangeText={(name) => set(index, { name })}
              placeholder={t("po.optionNamePlaceholder")}
              testID={`${testIDPrefix}-name-${index}`}
            />
          </View>
          <View style={styles.rowField}>
            <TextField
              label={t("po.optionValue")}
              value={row.value}
              onChangeText={(value) => set(index, { value })}
              placeholder={
                isColourName(row.name) ? t("po.colourPlaceholder") : t("po.valuePlaceholder")
              }
              testID={`${testIDPrefix}-value-${index}`}
            />
          </View>
        </View>
      ))}
      {rows.length < 3 ? (
        <TextButton
          label={t("po.addOption")}
          icon="plus"
          testID={`${testIDPrefix}-add`}
          onPress={() => onChange([...rows, { name: "", value: "" }])}
        />
      ) : null}
    </View>
  );
}

/** Change the option values of an existing variant. */
export function VariantOptionsForm({ client, data, generateKey, reload }: SectionProps) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const [variantId, setVariantId] = useState<string | null>(data.variants[0]?.id ?? null);
  const [rows, setRows] = useState<VariantOptionEntry[]>(() =>
    optionRowsFor(data, data.variants[0]?.id ?? null),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const mutation = useMutation(
    (args: { variantId: string; options: VariantOptionEntry[] }, key) =>
      setVariantOptions(client, { productId: data.product.id, ...args }, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => reload());

  if (data.variants.length === 0) return null;

  function choose(id: string) {
    setVariantId(id);
    setRows(optionRowsFor(data, id));
    setProblem(null);
    mutation.reset();
  }

  function onSubmit() {
    if (!variantId) return;
    const { entries, problem: issue } = cleanOptionEntries(rows);
    setProblem(issue);
    if (issue) return;
    mutation.submit({ variantId, options: entries });
  }

  return (
    <View style={styles.body}>
      <SectionHeading title={t("po.editVariantOptions")} />
      <SelectField
        label={t("po.variant")}
        options={data.variants.map((variant) => ({
          value: variant.id,
          label: variant.displayName ? `${variant.displayName} · ${variant.sku}` : variant.sku,
        }))}
        selected={variantId}
        onSelect={choose}
        testIDPrefix="vo-variant"
      />
      <OptionRowsField rows={rows} onChange={setRows} testIDPrefix="vo-row" />
      {problem ? <Notice tone="danger" message={problem} /> : null}
      {mutation.state.status === "success" ? (
        <Notice tone="success" message={t("po.optionsSaved")} testID="vo-success" />
      ) : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError state={mutation.state} mutation={mutation} onRefresh={reload} />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? t("po.saving") : t("po.saveOptions")}
        icon="content-save-outline"
        testID="vo-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </View>
  );
}

/** Swatch colours for the values of colour-like options (shown as chips on the website). */
export function SwatchesForm({ client, data, generateKey, reload }: SectionProps) {
  const { styles, colors } = useStyles();
  const { t } = useI18n();
  const colourOptions = data.options.filter((option) => isColourName(option.name));
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const option of colourOptions) {
      for (const value of option.values) map[value.id] = value.swatchHex ?? "";
    }
    return map;
  }, [colourOptions]);
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const mutation = useMutation(
    (values: { valueId: string; swatchHex: string | null }[], key) =>
      updateOptionValues(client, { productId: data.product.id, values }, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => reload());

  if (colourOptions.length === 0) {
    return <Notice message={t("po.noColours")} testID="swatch-empty" />;
  }

  function onSubmit() {
    const changed: { valueId: string; swatchHex: string | null }[] = [];
    for (const [valueId, text] of Object.entries(draft)) {
      const { hex, problem: issue } = normalizeSwatchHex(text);
      if (issue) {
        setProblem(issue);
        return;
      }
      if ((initial[valueId] || null) !== hex) changed.push({ valueId, swatchHex: hex });
    }
    setProblem(null);
    if (changed.length === 0) {
      setProblem(t("po.nothingChanged"));
      return;
    }
    mutation.submit(changed);
  }

  return (
    <View style={styles.body}>
      <SectionHeading title={t("po.swatches")} detail={t("po.swatchesDesc")} />
      {colourOptions.flatMap((option) =>
        option.values.map((value) => {
          const text = draft[value.id] ?? "";
          const preview = normalizeSwatchHex(text).hex;
          return (
            <View key={value.id} style={styles.swatchBlock} testID={`swatch-${value.id}`}>
              <View style={styles.swatchHead}>
                <View
                  style={[
                    styles.swatchPreview,
                    { backgroundColor: preview ?? colors.surfaceMuted, borderColor: colors.border },
                  ]}
                />
                <Text style={styles.swatchName}>{value.value}</Text>
              </View>
              <View style={styles.presets}>
                {PRESET_SWATCHES.map((hex) => (
                  <Pressable
                    key={hex}
                    accessibilityRole="button"
                    accessibilityLabel={t("po.useColour", { hex })}
                    testID={`swatch-${value.id}-${hex.slice(1)}`}
                    onPress={() => setDraft({ ...draft, [value.id]: hex })}
                    style={[
                      styles.preset,
                      { backgroundColor: hex, borderColor: colors.border },
                      preview === hex ? { borderColor: colors.ink, borderWidth: 3 } : null,
                    ]}
                  />
                ))}
              </View>
              <TextField
                label={t("po.hex")}
                value={text}
                onChangeText={(next) => setDraft({ ...draft, [value.id]: next })}
                placeholder="#1a1a1a"
                autoCapitalize="none"
                testID={`swatch-${value.id}-hex`}
              />
            </View>
          );
        }),
      )}
      {problem ? <Notice tone="danger" message={problem} /> : null}
      {mutation.state.status === "success" ? (
        <Notice tone="success" message={t("po.swatchesSaved")} testID="swatch-success" />
      ) : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError state={mutation.state} mutation={mutation} onRefresh={reload} />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? t("po.saving") : t("po.saveSwatches")}
        icon="palette-outline"
        testID="swatch-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </View>
  );
}

/** Indented category list in tree order (parents before their children). */
export function orderCategories(categories: CategoryListResponse["categories"]) {
  const children = new Map<string | null, CategoryListResponse["categories"]>();
  for (const category of categories) {
    const list = children.get(category.parentId) ?? [];
    list.push(category);
    children.set(category.parentId, list);
  }
  const out: { category: CategoryListResponse["categories"][number]; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const list = [...(children.get(parentId) ?? [])].sort(
      (a, b) => a.position - b.position || a.name.localeCompare(b.name),
    );
    for (const category of list) {
      out.push({ category, depth });
      walk(category.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Choose which categories the product appears in on the website. */
export function ProductCategoriesForm({ client, data, generateKey, reload }: SectionProps) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const load = useCallback(() => client.listCategories(), [client]);
  const { state, reload: reloadCategories } = useAsync<CategoryListResponse>(load);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(data.categoryIds ?? []));
  const mutation = useMutation(
    (categoryIds: string[], key) =>
      setProductCategories(client, { productId: data.product.id, categoryIds }, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => reload());

  if (state.status === "loading") return <LoadingBlock label={t("po.loadingCategories")} />;
  if (state.status === "error") {
    return (
      <Notice
        tone="danger"
        message={t("po.categoriesError")}
        action={<TextButton label={t("common.retry")} icon="refresh" onPress={reloadCategories} />}
      />
    );
  }
  const ordered = orderCategories(state.data.categories);
  if (ordered.length === 0) {
    return <Notice message={t("po.noCategories")} testID="pc-empty" />;
  }

  function toggle(id: string, next: boolean) {
    const copy = new Set(selected);
    if (next) copy.add(id);
    else copy.delete(id);
    setSelected(copy);
    mutation.reset();
  }

  return (
    <View style={styles.body}>
      <SectionHeading title={t("po.categories")} />
      <Eyebrow>{t("po.selectedCount", { count: selected.size })}</Eyebrow>
      {ordered.map(({ category, depth }) => (
        <View key={category.id} style={{ paddingStart: depth * spacing.lg }}>
          <Checkbox
            checked={selected.has(category.id)}
            onChange={(next) => toggle(category.id, next)}
            label={
              category.status === "archived"
                ? t("po.archivedCategory", { name: category.name })
                : category.name
            }
            testID={`pc-${category.slug}`}
          />
        </View>
      ))}
      <Notice message={t("po.categoriesTip")} />
      {mutation.state.status === "success" ? (
        <Notice tone="success" message={t("po.categoriesSaved")} testID="pc-success" />
      ) : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError state={mutation.state} mutation={mutation} onRefresh={reload} />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? t("po.saving") : t("po.saveCategories")}
        icon="content-save-outline"
        testID="pc-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={() => mutation.submit([...selected])}
      />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    body: { gap: spacing.md },
    rows: { gap: spacing.sm },
    row: { flexDirection: "row", gap: spacing.sm },
    rowField: { flex: 1 },
    swatchBlock: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
    },
    swatchHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    swatchPreview: { width: 36, height: 36, borderRadius: 18, borderWidth: 1 },
    swatchName: { color: colors.ink, ...typography.cardTitle },
    presets: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    preset: { width: 34, height: 34, borderRadius: 17, borderWidth: 1 },
  });
  return { styles, colors };
});
