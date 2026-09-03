import type { MeContextResponse, ProductListResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo } from "react";
import { View } from "react-native";

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
  onBack: () => void;
}

/**
 * Read-only Products list for the active tenant. It reads catalog access from `/me/context` purely
 * for UX, but the server stays authoritative: a real `GET /products` that is denied surfaces as a
 * classified error (never a silent empty list).
 */
export function ProductsListScreen({
  tenantId,
  context,
  onOpenProduct,
  onBack,
}: ProductsListScreenProps) {
  // Context-driven UX gate, checked before any fetch is issued. This is not authorization — the API
  // enforces that — but there is no point calling `/products` for a caller known to lack read
  // access. Rendering a distinct component below means the fetch hook never runs in this case.
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
      onBack={onBack}
    />
  );
}

function ProductsListContent({
  tenantId,
  context,
  onOpenProduct,
  onBack,
}: ProductsListScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const load = useCallback(() => client.listProducts(), [client]);
  const { state, reload } = useAsync<ProductListResponse>(load);

  const brandNameById = useMemo(
    () => new Map(context.access.catalog.brands.map((brand) => [brand.id, brand.name])),
    [context],
  );

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Catalog" title="Products" onBack={onBack} />
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
        <Body>No products yet. Products created in this business will appear here.</Body>
      ) : null}
      {state.status === "success" && state.data.items.length > 0 ? (
        <View style={{ gap: 12 }}>
          {state.data.items.map((product) => {
            const brandName = brandNameById.get(product.brandId);
            return (
              <PressableRow
                key={product.id}
                testID={`product-row-${product.id}`}
                onPress={() => onOpenProduct(product.id)}
              >
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
                {product.styleCode ? (
                  <InfoRow label="Style code" value={product.styleCode} />
                ) : null}
                {brandName ? <InfoRow label="Brand" value={brandName} /> : null}
              </PressableRow>
            );
          })}
          {state.data.pageInfo.hasMore ? (
            <Eyebrow>Showing the first page of products</Eyebrow>
          ) : null}
        </View>
      ) : null}
    </ScrollScreen>
  );
}
