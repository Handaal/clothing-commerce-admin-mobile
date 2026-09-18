import type { MeContextResponse, ProductListResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo } from "react";
import { View } from "react-native";

import { brandNameMap } from "../catalog/brands";
import { describePublication, useProductObservation } from "../catalog/observations";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PressableRow,
  PrimaryButton,
  ScrollScreen,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { errorHeading, isRetryable } from "./display";

export interface ProductsListScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onOpenProduct: (productId: string) => void;
  onCreateProduct: () => void;
  onBack: () => void;
}

/**
 * Products list for the active tenant with management affordances. It reads catalog access from
 * `/me/context` for UX, but the server stays authoritative: a real `GET /products` that is denied
 * surfaces as a classified error (never a silent empty list), and every write control the manager
 * reaches from here is re-authorized server-side.
 */
export function ProductsListScreen({
  tenantId,
  context,
  onOpenProduct,
  onCreateProduct,
  onBack,
}: ProductsListScreenProps) {
  // Context-driven UX gate, checked before any fetch is issued. This is not authorization — the API
  // enforces that — but there is no point calling `/products` for a caller known to lack read access.
  if (!context.access.catalog.canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Catalog" title="Products" onBack={onBack} />
        <Divider />
        <Body>You do not have read access to this catalog. Ask an owner or administrator.</Body>
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
  const load = useCallback(() => client.listProducts(), [client]);
  const { state, reload } = useAsync<ProductListResponse>(load);

  const brandNameById = useMemo(() => brandNameMap(context.access.catalog), [context]);
  // No brand accessible → cannot author (never guess a brand id); hide the create control.
  const canAuthor = context.access.catalog.brands.length > 0;

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Catalog" title="Products" onBack={onBack} />
      {canAuthor ? (
        <PrimaryButton label="Create product" testID="create-product" onPress={onCreateProduct} />
      ) : null}
      <Divider />
      {state.status === "loading" ? <LoadingBlock label="Loading products…" /> : null}
      {state.status === "error" ? (
        <>
          <Title>{errorHeading(state.error.kind)}</Title>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label="Try again" onPress={reload} />
          ) : null}
        </>
      ) : null}
      {state.status === "success" && state.data.items.length === 0 ? (
        <Body>No products yet. Create your first product to get started.</Body>
      ) : null}
      {state.status === "success" && state.data.items.length > 0 ? (
        <View style={{ gap: 12 }}>
          {state.data.items.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              brandName={brandNameById.get(product.brandId)}
              onOpen={() => onOpenProduct(product.id)}
            />
          ))}
          {state.data.pageInfo.hasMore ? (
            <Eyebrow>Showing the first page of products</Eyebrow>
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
  // Session-observed Storefront publication state (the list read does not return it).
  const observation = useProductObservation(product.id);
  return (
    <PressableRow testID={`product-row-${product.id}`} onPress={onOpen}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Title>{product.name}</Title>
        <Badge label={product.status} testID={`product-status-${product.id}`} />
      </View>
      {product.styleCode ? <InfoRow label="Style code" value={product.styleCode} /> : null}
      {brandName ? <InfoRow label="Brand" value={brandName} /> : null}
      <InfoRow label="Storefront" value={describePublication(observation)} />
    </PressableRow>
  );
}
