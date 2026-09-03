import type { ProductDetailResponse } from "@shifted/clothing-commerce-sdk";
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
  PrimaryButton,
  ScrollScreen,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import { errorHeading, formatMoneyMinor, isRetryable } from "./display";

export interface ProductDetailScreenProps {
  tenantId: string;
  productId: string;
  onBack: () => void;
}

/** Read-only detail for a single product. Renders only fields returned by `GET /products/{id}`. */
export function ProductDetailScreen({ tenantId, productId, onBack }: ProductDetailScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const load = useCallback(() => client.getProduct(productId), [client, productId]);
  const { state, reload } = useAsync<ProductDetailResponse>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Catalog" title="Product" onBack={onBack} />
        <Divider />
        <LoadingBlock label="Loading product…" />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Catalog" title={errorHeading(state.error.kind)} onBack={onBack} />
        <Divider />
        <Body>{state.error.message}</Body>
        {isRetryable(state.error.kind) ? (
          <PrimaryButton label="Try again" onPress={reload} />
        ) : null}
      </ScrollScreen>
    );
  }

  return <ProductDetail data={state.data} onBack={onBack} />;
}

function ProductDetail({ data, onBack }: { data: ProductDetailResponse; onBack: () => void }) {
  const { product, variants, options, prices } = data;

  // First listed price per variant, for an at-a-glance read-only figure next to each variant.
  const priceByVariant = useMemo(() => {
    const map = new Map<string, string>();
    for (const price of prices) {
      if (!map.has(price.variantId)) {
        map.set(price.variantId, formatMoneyMinor(price.amountMinor, price.currency));
      }
    }
    return map;
  }, [prices]);

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Catalog" title={product.name} onBack={onBack} />
      <View style={{ flexDirection: "row" }}>
        <Badge label={product.status} testID="detail-status" />
      </View>
      <Divider />
      {product.styleCode ? <InfoRow label="Style code" value={product.styleCode} /> : null}
      <InfoRow label="Product id" value={product.id} />
      <InfoRow label="Brand id" value={product.brandId} />

      <Divider />
      <Eyebrow>Variants ({variants.length})</Eyebrow>
      {variants.length === 0 ? (
        <Body>This product has no variants.</Body>
      ) : (
        <View style={{ gap: 12 }}>
          {variants.map((variant) => (
            <View key={variant.id} testID={`variant-${variant.id}`} style={{ gap: 4 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Title>{variant.displayName ?? variant.sku}</Title>
                <Badge label={variant.status} />
              </View>
              <InfoRow label="SKU" value={variant.sku} />
              {priceByVariant.has(variant.id) ? (
                <InfoRow label="Price" value={priceByVariant.get(variant.id) as string} />
              ) : null}
            </View>
          ))}
        </View>
      )}

      {options.length > 0 ? (
        <>
          <Divider />
          <Eyebrow>Options</Eyebrow>
          {options.map((option) => (
            <InfoRow
              key={option.id}
              label={option.name}
              value={option.values.map((value) => value.value).join(", ")}
            />
          ))}
        </>
      ) : null}
    </ScrollScreen>
  );
}
