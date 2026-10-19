import type { MeContextResponse, ProductListResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { brandNameMap } from "../catalog/brands";
import { describePublication, useProductObservation } from "../catalog/observations";
import { useSession } from "../session/SessionProvider";
import { AppIcon } from "../ui/Icon";
import {
  Badge,
  Body,
  EmptyState,
  FilterChips,
  LoadingBlock,
  MetricCard,
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
import { useAsync } from "../ui/useAsync";
import { errorHeading, isRetryable } from "./display";

export interface ProductsListScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onOpenProduct: (productId: string) => void;
  onCreateProduct: () => void;
  onBack: () => void;
}

type StatusFilter = "all" | "draft" | "active" | "archived";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "archived", label: "Archived" },
] as const;

/**
 * Products list for the active tenant with management affordances. Context controls navigation UX
 * only; the Commerce API still authorizes the real read and every write independently.
 */
export function ProductsListScreen({
  tenantId,
  context,
  onOpenProduct,
  onCreateProduct,
  onBack,
}: ProductsListScreenProps) {
  if (!context.access.catalog.canRead) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow="Catalog"
          title="Products"
          description="Manage the catalog shared by your stores and website."
          icon="tag-multiple-outline"
          onBack={onBack}
        />
        <Notice
          tone="warning"
          title="Catalog access required"
          message="You do not have read access to this catalog. Ask an owner or administrator."
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
      onBack={onBack}
    />
  );
}

function ProductsListContent({
  tenantId,
  context,
  onOpenProduct,
  onCreateProduct,
  onBack,
}: ProductsListScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
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

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow="Catalog"
        title="Products"
        description="Build and maintain the catalog shared by every commerce channel."
        icon="tag-multiple-outline"
        onBack={onBack}
      />

      <Surface tone="brand" style={styles.catalogOverview}>
        <View style={styles.overviewCopy}>
          <Text style={styles.overviewTitle}>Catalog workspace</Text>
          <Text style={styles.overviewBody}>
            Products stay separate from selling. Manage product identity, variants, prices, media
            and website publication here.
          </Text>
        </View>
        {canAuthor ? (
          <PrimaryButton
            label="Create product"
            icon="plus"
            testID="create-product"
            onPress={onCreateProduct}
          />
        ) : null}
      </Surface>

      {state.status === "success" ? (
        <View style={styles.metrics}>
          <MetricCard label="Loaded products" value={String(items.length)} icon="package-variant" />
          <MetricCard
            label="Active"
            value={String(activeCount)}
            icon="check-circle-outline"
            tone="accent"
          />
        </View>
      ) : null}

      <View style={styles.listControls}>
        <SectionHeading
          title="Product catalog"
          detail={state.status === "success" ? `${items.length} shown` : undefined}
        />
        <FilterChips
          options={STATUS_FILTERS}
          selected={statusFilter}
          onSelect={setStatusFilter}
          testIDPrefix="product-status-filter"
        />
      </View>

      {state.status === "loading" ? <LoadingBlock label="Loading products…" /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <TextButton label="Try again" icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && items.length === 0 ? (
        <EmptyState
          icon="tag-outline"
          title={statusFilter === "all" ? "No products yet" : `No ${statusFilter} products`}
          message={
            statusFilter === "all"
              ? "Create your first product to begin building the management catalog."
              : "Try another lifecycle filter or create a new product."
          }
        />
      ) : null}
      {state.status === "success" && items.length > 0 ? (
        <View style={styles.productList}>
          {items.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              brandName={brandNameById.get(product.brandId)}
              onOpen={() => onOpenProduct(product.id)}
            />
          ))}
          {state.data.pageInfo.hasMore ? (
            <Notice message="More products are available. This screen currently shows the first bounded API page." />
          ) : null}
        </View>
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
  return (
    <PressableRow testID={`product-row-${product.id}`} onPress={onOpen}>
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
              <Text style={styles.productMeta}>Product details</Text>
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
        <Body>{publication}</Body>
      </View>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  catalogOverview: { gap: spacing.lg },
  overviewCopy: { gap: spacing.sm },
  overviewTitle: { color: colors.ink, ...typography.sectionTitle },
  overviewBody: { color: colors.inkMuted, ...typography.body },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  listControls: { gap: spacing.sm },
  productList: { gap: spacing.md },
  productRowTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  productIcon: {
    width: 48,
    height: 48,
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
});
