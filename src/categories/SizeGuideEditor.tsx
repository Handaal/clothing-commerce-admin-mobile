import type {
  CategoryListResponse,
  SizeGuide,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { setCategorySizeGuide } from "../catalog/operations";
import { useI18n, type MessageKey } from "../i18n";
import type { IdempotencyKeyFactory } from "../inventory/idempotency";
import { CatalogWriteError, useOnSuccess } from "../products/catalog-write-ui";
import {
  Body,
  Notice,
  PrimaryButton,
  SectionHeading,
  SelectField,
  TextButton,
  TextField,
} from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { useMutation } from "../ui/useMutation";
import { createThemedStyles } from "../ui/useTheme";
import {
  draftFromGuide,
  parseDraft,
  templateDraft,
  type SizeGuideDraft,
  type SizeGuideProblem,
} from "./size-guide";

type Category = CategoryListResponse["categories"][number];

function problemMessage(
  problem: SizeGuideProblem,
  t: (key: MessageKey, params?: Record<string, string | number>) => string,
): string {
  switch (problem.kind) {
    case "no-columns":
      return t("sg.problemNoColumns");
    case "too-many-columns":
      return t("sg.problemTooManyColumns");
    case "no-rows":
      return t("sg.problemNoRows");
    case "too-many-rows":
      return t("sg.problemTooManyRows");
    case "missing-size":
      return t("sg.problemMissingSize", { line: problem.line });
    case "value-count":
      return t("sg.problemValueCount", {
        line: problem.line,
        size: problem.size,
        expected: problem.expected,
        found: problem.found,
      });
    case "duplicate-size":
      return t("sg.problemDuplicate", { size: problem.size });
    case "too-long":
      return t("sg.problemTooLong", { line: problem.line });
  }
}

/**
 * Size chart for a category (SDK 0.46). Products in this category and its sub-categories show it on
 * the website, unless a closer category has its own. Typed as text so it works well on a phone, with
 * a live preview of the table shoppers will see.
 */
export function SizeGuideEditor({
  client,
  category,
  generateKey,
  onSaved,
}: {
  client: TenantCommerceClient;
  category: Category;
  generateKey: IdempotencyKeyFactory;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const existing = category.sizeGuide ?? null;
  const [draft, setDraft] = useState<SizeGuideDraft>(() => draftFromGuide(existing));
  const [showProblem, setShowProblem] = useState(false);
  const parsed = useMemo(() => parseDraft(draft), [draft]);
  const mutation = useMutation(
    (sizeGuide: SizeGuide | null, key) =>
      setCategorySizeGuide(client, { categoryId: category.id, sizeGuide }, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => onSaved());
  const busy = mutation.state.status === "submitting";
  const update = (patch: Partial<SizeGuideDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  function save() {
    setShowProblem(true);
    if (parsed.ok) mutation.submit(parsed.guide);
  }

  return (
    <View style={styles.wrap} testID={`sg-editor-${category.slug}`}>
      <SectionHeading title={t("sg.title")} detail={t("sg.desc")} />
      <View style={styles.templates}>
        <Body>{t("sg.startFrom")}</Body>
        <TextButton
          label={t("sg.templateTops")}
          icon="tshirt-crew-outline"
          testID={`sg-template-tops-${category.slug}`}
          onPress={() => setDraft((current) => templateDraft("tops", current))}
        />
        <TextButton
          label={t("sg.templateBottoms")}
          icon="human-male"
          testID={`sg-template-bottoms-${category.slug}`}
          onPress={() => setDraft((current) => templateDraft("bottoms", current))}
        />
      </View>
      <TextField
        label={t("sg.heading")}
        value={draft.title}
        onChangeText={(title) => update({ title })}
        placeholder={t("sg.headingPlaceholder")}
        testID={`sg-heading-${category.slug}`}
      />
      <SelectField
        label={t("sg.unit")}
        options={[
          { value: "cm", label: t("sg.unitCm") },
          { value: "in", label: t("sg.unitIn") },
        ]}
        selected={draft.unit}
        onSelect={(unit) => update({ unit: unit === "in" ? "in" : "cm" })}
        testIDPrefix={`sg-unit-${category.slug}`}
      />
      <TextField
        label={t("sg.columns")}
        value={draft.columns}
        onChangeText={(columns) => update({ columns })}
        placeholder={t("sg.columnsPlaceholder")}
        hint={t("sg.columnsHint")}
        testID={`sg-columns-${category.slug}`}
        required
      />
      <TextField
        label={t("sg.rows")}
        value={draft.rows}
        onChangeText={(rows) => update({ rows })}
        placeholder={t("sg.rowsPlaceholder")}
        hint={t("sg.rowsHint")}
        multiline
        autoCapitalize="characters"
        testID={`sg-rows-${category.slug}`}
        required
      />
      <TextField
        label={t("sg.note")}
        value={draft.note}
        onChangeText={(note) => update({ note })}
        placeholder={t("sg.notePlaceholder")}
        multiline
        testID={`sg-note-${category.slug}`}
      />

      {parsed.ok ? (
        <View style={styles.preview} testID={`sg-preview-${category.slug}`}>
          <Text style={styles.previewLabel}>{t("sg.preview")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={[styles.tr, styles.thead]}>
                <Text style={[styles.cell, styles.th]}>{t("sg.size")}</Text>
                {parsed.guide.columns.map((column) => (
                  <Text key={column} style={[styles.cell, styles.th]}>
                    {column}
                  </Text>
                ))}
              </View>
              {parsed.guide.rows.map((row) => (
                <View key={row.size} style={styles.tr}>
                  <Text style={[styles.cell, styles.rowHead]}>{row.size}</Text>
                  {row.values.map((value, index) => (
                    <Text key={`${row.size}-${index}`} style={styles.cell}>
                      {value || "—"}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : showProblem ? (
        <Notice tone="danger" message={problemMessage(parsed.problem, t)} />
      ) : null}

      {mutation.state.status === "error" ? (
        <CatalogWriteError state={mutation.state} mutation={mutation} onRefresh={onSaved} />
      ) : null}
      <PrimaryButton
        label={busy ? t("po.saving") : t("sg.save")}
        icon="ruler"
        testID={`sg-save-${category.slug}`}
        disabled={busy}
        onPress={save}
      />
      {existing ? (
        <PrimaryButton
          variant="secondary"
          label={t("sg.remove")}
          icon="delete-outline"
          testID={`sg-remove-${category.slug}`}
          disabled={busy}
          onPress={() => mutation.submit(null)}
        />
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    wrap: { gap: spacing.md },
    templates: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
    preview: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    previewLabel: { color: colors.inkMuted, ...typography.caption },
    tr: { flexDirection: "row" },
    thead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    cell: {
      minWidth: 72,
      paddingVertical: 6,
      paddingHorizontal: 8,
      color: colors.ink,
      textAlign: "center",
      ...typography.caption,
    },
    th: { color: colors.inkMuted, fontWeight: "700" },
    rowHead: { fontWeight: "700" },
  });
  return { styles };
});
