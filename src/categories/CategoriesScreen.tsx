import type {
  CategoryListResponse,
  MeContextResponse,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  createCategory,
  setCategoryStatus,
  slugify,
  updateCategory,
  validateProductName,
  validateSlug,
  type CategoryArgs,
} from "../catalog/operations";
import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { CatalogWriteError, useOnSuccess } from "../products/catalog-write-ui";
import { orderCategories } from "../products/ProductOptionsSection";
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  Divider,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  SelectField,
  Surface,
  TextButton,
  TextField,
} from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import { createThemedStyles } from "../ui/useTheme";
import { SizeGuideEditor } from "./SizeGuideEditor";

type Category = CategoryListResponse["categories"][number];

export interface CategoriesScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

/**
 * The website's category tree (SDK 0.44): top-level categories are the audience (e.g. Men),
 * children are product types. Admins create, rename, re-parent and archive categories here; products
 * join categories from their own product page. The server rejects cycles and duplicate slugs and
 * authorizes every write (catalog.author).
 */
export function CategoriesScreen({
  tenantId,
  context,
  onBack,
  generateIdempotencyKey,
}: CategoriesScreenProps) {
  const { t } = useI18n();
  if (!context.access.catalog.canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow={t("cat.eyebrow")} title={t("cat.title")} onBack={onBack} />
        <Notice tone="warning" title={t("cat.accessTitle")} message={t("cat.accessBody")} />
      </ScrollScreen>
    );
  }
  return (
    <CategoriesContent
      tenantId={tenantId}
      onBack={onBack}
      generateKey={generateIdempotencyKey ?? secureIdempotencyKey}
    />
  );
}

function CategoriesContent({
  tenantId,
  onBack,
  generateKey,
}: {
  tenantId: string;
  onBack: () => void;
  generateKey: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const load = useCallback(() => client.listCategories(), [client]);
  const { state, reload, refresh, refreshing } = useAsync<CategoryListResponse>(load);
  const [editing, setEditing] = useState<string | null>(null);

  const categories = state.status === "success" ? state.data.categories : [];
  const ordered = orderCategories(categories);

  return (
    <ScrollScreen onRefresh={refresh} refreshing={refreshing}>
      <PageHeader
        eyebrow={t("cat.eyebrow")}
        title={t("cat.title")}
        description={t("cat.desc")}
        icon="file-tree-outline"
        onBack={onBack}
      />
      <Surface style={styles.card}>
        <CategoryForm
          client={client}
          categories={categories}
          generateKey={generateKey}
          onSaved={reload}
        />
      </Surface>

      <SectionHeading title={t("cat.listTitle")} detail={t("cat.listDesc")} />
      {state.status === "loading" ? <LoadingBlock label={t("cat.loading")} /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <TextButton label={t("common.retry")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && ordered.length === 0 ? (
        <Notice message={t("cat.empty")} testID="cat-empty" />
      ) : null}
      {ordered.map(({ category, depth }) => (
        <Surface
          key={category.id}
          tone="muted"
          style={[styles.row, { marginStart: depth * spacing.lg }]}
          testID={`cat-row-${category.slug}`}
        >
          <View style={styles.rowTop}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowName}>{category.name}</Text>
              <Text style={styles.rowMeta}>
                {t("cat.rowMeta", { slug: category.slug, count: category.productCount })}
              </Text>
            </View>
            {category.sizeGuide ? <Badge label={t("sg.badge")} tone="brand" /> : null}
            {category.status === "archived" ? (
              <Badge label={t("cat.archived")} tone="warning" />
            ) : null}
          </View>
          {editing === category.id ? (
            <>
              <Divider />
              <CategoryForm
                client={client}
                categories={categories}
                existing={category}
                generateKey={generateKey}
                onSaved={() => {
                  setEditing(null);
                  reload();
                }}
              />
              <Divider />
              <SizeGuideEditor
                client={client}
                category={category}
                generateKey={generateKey}
                onSaved={() => {
                  setEditing(null);
                  reload();
                }}
              />
              <Divider />
              <ArchiveToggle
                client={client}
                category={category}
                generateKey={generateKey}
                onSaved={() => {
                  setEditing(null);
                  reload();
                }}
              />
              <TextButton
                label={t("common.cancel")}
                icon="close"
                onPress={() => setEditing(null)}
              />
            </>
          ) : (
            <TextButton
              label={t("cat.edit")}
              icon="pencil-outline"
              testID={`cat-edit-${category.slug}`}
              onPress={() => setEditing(category.id)}
            />
          )}
        </Surface>
      ))}
    </ScrollScreen>
  );
}

/** Create (no `existing`) or edit a category. Slug follows the name until edited by hand. */
function CategoryForm({
  client,
  categories,
  existing,
  generateKey,
  onSaved,
}: {
  client: TenantCommerceClient;
  categories: Category[];
  existing?: Category;
  generateKey: IdempotencyKeyFactory;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const [name, setName] = useState(existing?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(existing));
  const [parentId, setParentId] = useState<string>(existing?.parentId ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const mutation = useMutation(
    (args: CategoryArgs, key) =>
      existing
        ? updateCategory(client, { ...args, categoryId: existing.id }, key)
        : createCategory(client, args, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => {
    if (!existing) {
      setName("");
      setSlug("");
      setSlugEdited(false);
    }
    onSaved();
  });

  // A category can't sit under itself; the server also rejects deeper cycles (CATEGORY_CYCLE).
  const parents = [
    { value: "", label: t("cat.topLevel") },
    ...orderCategories(categories)
      .filter(({ category }) => category.id !== existing?.id && category.status === "active")
      .map(({ category, depth }) => ({
        value: category.id,
        label: `${"— ".repeat(depth)}${category.name}`,
      })),
  ];

  function onSubmit() {
    const issue = validateProductName(name) ?? validateSlug(slug);
    setProblem(issue);
    if (issue) return;
    mutation.submit({ name: name.trim(), slug: slug.trim(), parentId: parentId || null });
  }

  return (
    <View style={styles.form}>
      {existing ? null : <SectionHeading title={t("cat.newTitle")} detail={t("cat.newDesc")} />}
      <TextField
        label={t("cat.name")}
        value={name}
        onChangeText={(next) => {
          setName(next);
          if (!slugEdited) setSlug(slugify(next));
        }}
        placeholder={t("cat.namePlaceholder")}
        testID={existing ? `cat-name-${existing.slug}` : "cat-new-name"}
        required
      />
      <TextField
        label={t("cat.slug")}
        value={slug}
        onChangeText={(next) => {
          setSlug(next);
          setSlugEdited(true);
        }}
        hint={t("cat.slugHint")}
        autoCapitalize="none"
        testID={existing ? `cat-slug-${existing.slug}` : "cat-new-slug"}
        required
      />
      <SelectField
        label={t("cat.parent")}
        options={parents}
        selected={parentId}
        onSelect={setParentId}
        testIDPrefix={existing ? `cat-parent-${existing.slug}` : "cat-new-parent"}
      />
      {problem ? <Notice tone="danger" message={problem} /> : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError state={mutation.state} mutation={mutation} onRefresh={onSaved} />
      ) : null}
      <PrimaryButton
        label={
          mutation.state.status === "submitting"
            ? t("po.saving")
            : existing
              ? t("common.saveChanges")
              : t("cat.create")
        }
        icon={existing ? "content-save-outline" : "plus"}
        testID={existing ? `cat-save-${existing.slug}` : "cat-new-submit"}
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </View>
  );
}

function ArchiveToggle({
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
  const archived = category.status === "archived";
  const mutation = useMutation(
    (status: "active" | "archived", key) =>
      setCategoryStatus(client, { categoryId: category.id, status }, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => onSaved());
  return (
    <View style={{ gap: spacing.sm }}>
      <Body>{archived ? t("cat.restoreHelp") : t("cat.archiveHelp")}</Body>
      {mutation.state.status === "error" ? (
        <CatalogWriteError state={mutation.state} mutation={mutation} onRefresh={onSaved} />
      ) : null}
      <PrimaryButton
        variant="secondary"
        label={archived ? t("cat.restore") : t("cat.archive")}
        icon={archived ? "restore" : "archive-outline"}
        testID={`cat-${archived ? "restore" : "archive"}-${category.slug}`}
        disabled={mutation.state.status === "submitting"}
        onPress={() => mutation.submit(archived ? "active" : "archived")}
      />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    card: { gap: spacing.md },
    form: { gap: spacing.md },
    row: { gap: spacing.sm, shadowOpacity: 0, elevation: 0 },
    rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    rowCopy: { flex: 1, gap: 2 },
    rowName: { color: colors.ink, ...typography.cardTitle },
    rowMeta: { color: colors.inkMuted, ...typography.caption },
  });
  return { styles };
});
