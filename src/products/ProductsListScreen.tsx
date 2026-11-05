import type { MeContextResponse, ProductListResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { brandNameMap } from "../catalog/brands";
import { describePublication, useProductObservation } from "../catalog/observations";
import { useI18n, type MessageKey } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { AppIcon } from "../ui/Icon";
import {
  Badge,
  EmptyState,
  FilterChips,
  HeaderIconButton,
  LoadingBlock,
  Notice,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ResponsiveList,
  ScrollScreen,
  SectionHeading,
  SummaryStrip,
  Surface,
  TextButton,
} from "../ui/components";
import { colors, radius, spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { errorHeading, isRetryable } from "./display";

export interface ProductsListScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onOpenProduct: (productId: string) => void;
  onCreateProduct: () => void;
  onBack?: () => void;
}

type StatusFilter = "all" | "draft" | "active" | "archived";

const STATUS_FILTER_KEYS = {
  all: "filter.all",
  active: "filter.active",
  draft: "filter.draft",
  archived: "filter.archived",
} as const satisfies Record<StatusFilter, MessageKey>;

/**
 * Products list for the active tenant with management affordances. Context controls navigation UX
 * only; the Commerce API still authorizes the real read and every write independently.
 */
export function ProductsListScreen({
  tenantId,
  context,
  onOpenProduct,
  onCreateProduct,
}: ProductsListScreenProps) {
  const { t } = useI18n();
  if (!context.access.catalog.canRead) {
    return (
      <ScrollScreen wide>
        <PageHeader
          eyebrow={t("products.eyebrow")}
          title={t("products.title")}
          description={t("products.headerNoAccessDesc")}
          icon="tag-multiple-outline"
        />
        <Notice
          tone="warning"
          title={t("products.accessTitle")}
          message={t("products.accessBody")}
        />
      </ScrollScreen>
    );
  }

  return (
    <ProductsListContent
      tenantId={tenantId}
      context={context}
      onOpenProduct={onOpenProduct}
      onCreateProduct={onCreateProduct}
    />
  );
}

function ProductsListContent({
  tenantId,
  context,
  onOpenProduct,
  onCreateProduct,
}: Omit<ProductsListScreenProps, "onBack">) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const statusFilterOptions = (Object.keys(STATUS_FILTER_KEYS) as StatusFilter[]).map((value) => ({
    value,
    label: t(STATUS_FILTER_KEYS[value]),
  }));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const load = useCallback(
    () => client.listProducts(statusFilter === "all" ? undefined : { status: statusFilter }),
    [client, statusFilter],
  );
  const { state, reload } = useAsync<ProductListResponse>(load);

  const brandNameById = useMemo(() => brandNameMap(context.access.catalog), [context]);
  const canAuthor = context.access.catalog.brands.length > 0;
  const items = state.status === "success" ? state.data.items : [];
  const activeCount = items.filter((product) => product.status === "active").length;
  const isEmpty = state.status === "success" && items.length === 0;

  return (
    <ScrollScreen wide>
      <PageHeader
        eyebrow={t("products.eyebrow")}
        title={t("products.title")}
        description={t("products.headerDesc")}
        icon="tag-multiple-outline"
        action={
          canAuthor && !isEmpty ? (
            <HeaderIconButton
              label={t("products.createCta")}
              icon="plus"
              testID="create-product"
              onPress={onCreateProduct}
            />
          ) : undefined
        }
      />

      <Surface tone="brand" style={styles.catalogOverview}>
        <View style={styles.overviewCopy}>
          <Text style={styles.overviewTitle}>{t("products.workspaceTitle")}</Text>
          <Text style={styles.overviewBody}>{t("products.workspaceBody")}</Text>
        </View>
      </Surface>

      <View style={styles.listControls}>
        <SectionHeading
          title={t("products.catalogHeading")}
          detail={
            state.status === "success" ? t("common.shown", { count: items.length }) : undefined
          }
        />
        <FilterChips
          options={statusFilterOptions}
          selected={statusFilter}
          onSelect={setStatusFilter}
          testIDPrefix="product-status-filter"
        />
      </View>

      {state.status === "success" ? (
        <SummaryStrip
          testID="products-summary"
          items={[
            {
              label: t("products.loadedProducts"),
              value: String(items.length),
              icon: "package-variant",
            },
            {
              label: t("products.activeMetric"),
              value: String(activeCount),
              icon: "check-circle-outline",
              tone: "accent",
            },
          ]}
        />
      ) : null}

      {state.status === "loading" ? <LoadingBlock label={t("products.loading")} /> : null}
      {state.status === "error" ? (
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
      ) : null}
      {state.status === "success" && items.length === 0 ? (
        <EmptyState
          icon="tag-outline"
          title={
            statusFilter === "all"
              ? t("products.emptyAllTitle")
              : t("products.emptyFilteredTitle", { status: t(STATUS_FILTER_KEYS[statusFilter]) })
          }
          message={
            statusFilter === "all" ? t("products.emptyAllBody") : t("products.emptyFilteredBody")
          }
          action={
            statusFilter !== "all" ? (
              <PrimaryButton
                label={t("products.showAll")}
                icon="format-list-bulleted"
                onPress={() => setStatusFilter("all")}
              />
            ) : canAuthor ? (
              <PrimaryButton
                label={t("products.createCta")}
                icon="plus"
                testID="create-product"
                onPress={onCreateProduct}
              />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && items.length > 0 ? (
        <ResponsiveList>
          {items.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              brandName={brandNameById.get(product.brandId)}
              onOpen={() => onOpenProduct(product.id)}
            />
          ))}
        </ResponsiveList>
      ) : null}
      {state.status === "success" && state.data.pageInfo.hasMore ? (
        <Notice message={t("products.moreAvailable")} />
      ) : null}
    </ScrollScreen>
  );
}

function ProductRow({
  product,
  brandName,
  onOpen,
}: {
  product: ProductListResponse["items"][number];
  brandName: string | undefined;
  onOpen: () => void;
}) {
  const observation = useProductObservation(product.id);
  const publication = describePublication(observation);
  const { t } = useI18n();
  return (
    <PressableRow testID={`product-row-${product.id}`} onPress={onOpen} density="compact">
      <View style={styles.productRowTop}>
        <View style={styles.productIcon}>
          <AppIcon name="tshirt-crew-outline" size={25} color={colors.brand} />
        </View>
        <View style={styles.productCopy}>
          <Text style={styles.productName}>{product.name}</Text>
          <View style={styles.productMetadata}>
            {brandName ? <Text style={styles.productMeta}>{brandName}</Text> : null}
            {brandName && product.styleCode ? <Text style={styles.metaDot}>•</Text> : null}
            {product.styleCode ? <Text style={styles.productMeta}>{product.styleCode}</Text> : null}
            {!brandName && !product.styleCode ? (
              <Text style={styles.productMeta}>{t("products.detailsFallback")}</Text>
            ) : null}
          </View>
        </View>
        <Badge label={product.status} testID={`product-status-${product.id}`} />
      </View>
      <View style={styles.publicationRow}>
        <AppIcon
          name={observation?.storefrontStatus === "published" ? "web-check" : "web"}
          size={17}
          color={observation?.storefrontStatus === "published" ? colors.success : colors.inkSubtle}
        />
        <Text numberOfLines={1} style={styles.publicationText}>
          {publication}
        </Text>
      </View>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  catalogOverview: { gap: spacing.lg },
  overviewCopy: { gap: spacing.sm },
  overviewTitle: { color: colors.ink, ...typography.sectionTitle },
  overviewBody: { color: colors.inkMuted, ...typography.body },
  listControls: { gap: spacing.sm },
  productRowTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  productIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.brandSoft,
  },
  productCopy: { flex: 1, gap: 3 },
  productName: { color: colors.ink, ...typography.cardTitle },
  productMetadata: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  productMeta: { color: colors.inkMuted, ...typography.caption },
  metaDot: { color: colors.inkSubtle, ...typography.caption },
  publicationRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  publicationText: {
    flex: 1,
    color: colors.inkMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
});
