import type {
  CollectionDetailResponse,
  ProductListResponse,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { describeCatalogWriteError } from "../catalog/write-errors";
import { secureIdempotencyKey } from "../inventory/idempotency";
import { useI18n } from "../i18n";
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import { AppIcon } from "../ui/Icon";
import {
  Badge,
  Body,
  EmptyState,
  LoadingBlock,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  Surface,
  TextButton,
} from "../ui/components";
import { colors, radius, spacing, typography } from "../ui/theme";
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
        <PageHeader eyebrow={t("collections.eyebrow")} title={t("manageCollection.title")} icon="shape-outline" onBack={onBack} />
        <LoadingBlock label={t("manageCollection.loading")} />
      </ScrollScreen>
    );
  }
  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow={t("collections.eyebrow")} title={t("manageCollection.title")} icon="shape-outline" onBack={onBack} />
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

  return (
    <ManageContent
      client={client}
      data={state.data}
      onBack={onBack}
      reload={reload}
    />
  );
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
  const { t } = useI18n();
  const toast = useToast();
  const { collection } = data.detail;
  const [selected, setSelected] = useState<string[]>(data.detail.productIds);

  const membership = useMutation(
    (productIds: string[], key) =>
      client.setCollectionProducts({ collectionId: collection.id, productIds, idempotencyKey: key }),
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
      client.setCollectionStatus({ collectionId: collection.id, status: next, idempotencyKey: key }),
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
        description={collection.description ?? t("manageCollection.membershipDesc")}
        icon="shape-outline"
        onBack={onBack}
      />

      <Surface tone="brand" style={styles.statusCard}>
        <View style={styles.statusHeader}>
          <SectionHeading title={t("manageCollection.statusSection")} />
          <Badge label={collection.status} />
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
        <EmptyState icon="tag-outline" title={t("manageCollection.noProducts")} message={t("manageCollection.noProducts")} />
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
                    {product.styleCode ? <Text style={styles.meta}>{product.styleCode}</Text> : null}
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
