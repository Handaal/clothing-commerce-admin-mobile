import type { CollectionDetailResponse, ProductListResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { CatalogImageField } from "../catalog/CatalogImageField";
import { describeCatalogWriteError } from "../catalog/write-errors";
import { secureIdempotencyKey } from "../inventory/idempotency";
import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import { AppIcon } from "../ui/Icon";
import {
  Badge,
  StatusBadge,
  Body,
  EmptyState,
  LoadingBlock,
  Notice,
  PageHeader,
  PressableRow,
  FormSection,
  PrimaryButton,
  TextField,
  ScrollScreen,
  SectionHeading,
  Surface,
  TextButton,
} from "../ui/components";
import { radius, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useToast } from "../ui/Toast";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";

export interface CollectionManageScreenProps {
  tenantId: string;
  collectionId: string;
  onBack: () => void;
}

interface LoadedData {
  detail: CollectionDetailResponse;
  products: ProductListResponse;
}

/**
 * Manage a single collection: publish/unpublish/archive, and curate its ordered product membership by
 * tapping products in/out. Membership is saved as the full authoritative, position-ordered list via
 * `setCollectionProducts`; lifecycle via `setCollectionStatus`. Both reuse a stable idempotency key per
 * logical action.
 */
export function CollectionManageScreen({
  tenantId,
  collectionId,
  onBack,
}: CollectionManageScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();

  const load = useCallback(async (): Promise<LoadedData> => {
    const [detail, products] = await Promise.all([
      client.getCollection(collectionId),
      client.listProducts({ status: "active" }),
    ]);
    return { detail, products };
  }, [client, collectionId]);
  const { state, reload } = useAsync<LoadedData>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("collections.eyebrow")}
          title={t("manageCollection.title")}
          icon="shape-outline"
          onBack={onBack}
        />
        <LoadingBlock label={t("manageCollection.loading")} />
      </ScrollScreen>
    );
  }
  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("collections.eyebrow")}
          title={t("manageCollection.title")}
          icon="shape-outline"
          onBack={onBack}
        />
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <TextButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      </ScrollScreen>
    );
  }

  return <ManageContent client={client} data={state.data} onBack={onBack} reload={reload} />;
}

function ManageContent({
  client,
  data,
  onBack,
  reload,
}: {
  client: ReturnType<ReturnType<typeof useSession>["getTenantClient"]>;
  data: LoadedData;
  onBack: () => void;
  reload: () => void;
}) {
  const { styles, colors } = useStyles();
  const { t } = useI18n();
  const toast = useToast();
  const { collection } = data.detail;
  const [selected, setSelected] = useState<string[]>(data.detail.productIds);

  const membership = useMutation(
    (productIds: string[], key) =>
      client.setCollectionProducts({
        collectionId: collection.id,
        productIds,
        idempotencyKey: key,
      }),
    secureIdempotencyKey,
    {
      onSuccess: () => {
        toast.success(t("manageCollection.savedToast"));
        reload();
      },
      onError: (error) => {
        const described = describeCatalogWriteError(error);
        toast.error(described.message, { title: described.heading });
      },
    },
  );

  const status = useMutation(
    (next: "draft" | "active" | "archived", key) =>
      client.setCollectionStatus({
        collectionId: collection.id,
        status: next,
        idempotencyKey: key,
      }),
    secureIdempotencyKey,
    {
      onSuccess: () => {
        toast.success(t("manageCollection.savedToast"));
        reload();
      },
      onError: (error) => {
        const described = describeCatalogWriteError(error);
        toast.error(described.message, { title: described.heading });
      },
    },
  );

  function toggle(productId: string) {
    setSelected((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  const products = data.products.items;
  const busy = membership.state.status === "submitting" || status.state.status === "submitting";

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("collections.eyebrow")}
        title={collection.name}
        icon="shape-outline"
        onBack={onBack}
      />

      <CollectionDetailsForm client={client} collection={collection} onSaved={reload} />

      <Surface tone="brand" style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <SectionHeading title={t("manageCollection.statusSection")} />
          <StatusBadge status={collection.status} />
        </View>
        <View style={styles.statusActions}>
          {collection.status !== "active" ? (
            <PrimaryButton
              label={t("manageCollection.publish")}
              icon="web-check"
              disabled={busy}
              testID="collection-publish"
              onPress={() => status.submit("active")}
            />
          ) : (
            <PrimaryButton
              label={t("manageCollection.unpublish")}
              icon="web"
              disabled={busy}
              testID="collection-unpublish"
              onPress={() => status.submit("draft")}
            />
          )}
          {collection.status !== "archived" ? (
            <TextButton
              label={t("manageCollection.archive")}
              icon="archive-outline"
              onPress={() => status.submit("archived")}
            />
          ) : null}
        </View>
      </Surface>

      <SectionHeading
        title={t("manageCollection.membershipSection")}
        detail={t("manageCollection.selectedCount", { count: selected.length })}
      />
      <Body>{t("manageCollection.membershipDesc")}</Body>

      {products.length === 0 ? (
        <EmptyState
          icon="tag-outline"
          title={t("manageCollection.noProducts")}
          message={t("manageCollection.noProducts")}
        />
      ) : (
        <View style={styles.list}>
          {products.map((product) => {
            const index = selected.indexOf(product.id);
            const isSelected = index >= 0;
            return (
              <PressableRow
                key={product.id}
                testID={`collection-product-${product.id}`}
                onPress={() => toggle(product.id)}
              >
                <View style={styles.rowTop}>
                  <View style={[styles.check, isSelected && styles.checkOn]}>
                    <AppIcon
                      name={isSelected ? "check" : "plus"}
                      size={18}
                      color={isSelected ? colors.surface : colors.brand}
                    />
                  </View>
                  <View style={styles.copy}>
                    <Text style={styles.name}>{product.name}</Text>
                    {product.styleCode ? (
                      <Text style={styles.meta}>{product.styleCode}</Text>
                    ) : null}
                  </View>
                  {isSelected ? <Badge label={String(index + 1)} tone="brand" /> : null}
                </View>
              </PressableRow>
            );
          })}
        </View>
      )}

      <Surface tone="accent">
        <PrimaryButton
          label={
            membership.state.status === "submitting"
              ? t("manageCollection.savingMembership")
              : t("manageCollection.saveMembership")
          }
          icon="content-save-outline"
          disabled={busy}
          testID="collection-save-products"
          onPress={() => membership.submit(selected)}
        />
      </Surface>
    </ScrollScreen>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    statusCard: { gap: spacing.md },
    statusHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    statusActions: { gap: spacing.sm },
    list: { gap: spacing.sm },
    rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    check: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    checkOn: { backgroundColor: colors.brand },
    copy: { flex: 1, gap: 3 },
    name: { color: colors.ink, ...typography.cardTitle },
    meta: { color: colors.inkMuted, ...typography.caption },
  });
  return { colors, styles };
});

/**
 * SDK 0.53: rename the collection, change its link (slug) and description, and choose its website cover.
 * The slug is part of the collection's web address, so the hint warns that old links stop working.
 */
function CollectionDetailsForm({
  client,
  collection,
  onSaved,
}: {
  client: ReturnType<ReturnType<typeof useSession>["getTenantClient"]>;
  collection: CollectionDetailResponse["collection"];
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(collection.name);
  const [slug, setSlug] = useState(collection.slug);
  const [description, setDescription] = useState(collection.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);

  const save = useMutation(
    (_: null, key) =>
      client.updateCollection({
        collectionId: collection.id,
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        ...(description.trim() ? { description: description.trim() } : {}),
        idempotencyKey: key,
      }),
    secureIdempotencyKey,
    {
      onSuccess: () => {
        toast.success(t("manageCollection.savedToast"));
        onSaved();
      },
      onError: (error) => {
        const described = describeCatalogWriteError(error);
        toast.error(described.message, { title: described.heading });
      },
    },
  );

  const dirty =
    name.trim() !== collection.name ||
    slug.trim().toLowerCase() !== collection.slug ||
    description.trim() !== (collection.description ?? "");

  function submit() {
    const n = name.trim();
    const sl = slug.trim().toLowerCase();
    setNameError(n ? null : t("collectionEdit.nameRequired"));
    const slugOk = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sl);
    setSlugError(slugOk ? null : t("collectionEdit.slugFormat"));
    if (!n || !slugOk) return;
    save.submit(null);
  }

  return (
    <FormSection
      title={t("collectionEdit.section")}
      icon="pencil-outline"
      testID="collection-details"
    >
      <TextField
        label={t("collectionEdit.name")}
        value={name}
        onChangeText={setName}
        error={nameError}
        testID="collection-name"
      />
      <TextField
        label={t("collectionEdit.slug")}
        value={slug}
        onChangeText={setSlug}
        autoCapitalize="none"
        hint={t("collectionEdit.slugHint")}
        error={slugError}
        testID="collection-slug"
      />
      <TextField
        label={t("collectionEdit.description")}
        value={description}
        onChangeText={setDescription}
        multiline
        testID="collection-description"
      />
      <PrimaryButton
        label={save.state.status === "submitting" ? t("siteText.saving") : t("collectionEdit.save")}
        icon="content-save-outline"
        disabled={!dirty || save.state.status === "submitting"}
        testID="collection-details-save"
        onPress={submit}
      />
      <CatalogImageField
        client={client}
        label={t("collectionEdit.cover")}
        hint={t("collectionEdit.coverHint")}
        image={collection.image}
        testID="collection-cover"
        onSave={async (image) => {
          await client.setCollectionImage({
            collectionId: collection.id,
            image,
            idempotencyKey: secureIdempotencyKey(),
          });
          toast.success(t("manageCollection.savedToast"));
          onSaved();
        }}
      />
    </FormSection>
  );
}
