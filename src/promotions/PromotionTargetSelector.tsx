import type { ProductDetailResponse, ProductListResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { errorHeading, isRetryable } from "../products/display";
import {
  Body,
  Divider,
  InfoRow,
  LoadingBlock,
  PrimaryButton,
  SelectField,
  SurfaceRow,
  TextButton,
  TextField,
  Title,
  type SelectOption,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
import type { PromotionClient } from "./client";
import type { PromotionTargetChoice } from "./form";
import { loadAllPromotionProducts } from "./load";

export function PromotionTargetSelector({
  client,
  choices,
  onChange,
}: {
  client: Pick<PromotionClient, "listProducts" | "getProduct">;
  choices: PromotionTargetChoice[];
  onChange: (choices: PromotionTargetChoice[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const load = useCallback(() => loadAllPromotionProducts(client), [client]);
  const { state, reload } = useAsync<ProductListResponse["items"]>(load);

  const productOptions = useMemo<SelectOption[]>(() => {
    if (state.status !== "success") return [];
    const term = search.trim().toLocaleLowerCase();
    return state.data
      .filter((product) => {
        if (!term) return true;
        return (
          product.name.toLocaleLowerCase().includes(term) ||
          (product.styleCode?.toLocaleLowerCase().includes(term) ?? false)
        );
      })
      .map((product) => ({
        value: product.id,
        label: `${product.name}${product.styleCode ? ` · ${product.styleCode}` : ""}`,
      }));
  }, [search, state]);

  function addChoice(choice: PromotionTargetChoice) {
    const key = targetKey(choice);
    if (choices.some((existing) => targetKey(existing) === key)) return;
    onChange([...choices, choice]);
  }

  return (
    <View style={{ gap: 12 }}>
      <Title>Selected targets</Title>
      {choices.length === 0 ? <Body>No Product or Variant targets selected.</Body> : null}
      {choices.map((choice) => (
        <SurfaceRow key={targetKey(choice)} testID={`promotion-target-${targetKey(choice)}`}>
          <InfoRow label={choice.target.productId ? "Product" : "Variant"} value={choice.label} />
          <TextButton
            label="Remove target"
            onPress={() =>
              onChange(choices.filter((existing) => targetKey(existing) !== targetKey(choice)))
            }
          />
        </SurfaceRow>
      ))}
      <Divider />
      <TextField
        label="Search Products"
        value={search}
        onChangeText={setSearch}
        placeholder="Name or style code"
        testID="promotion-target-search"
      />
      {state.status === "loading" ? <LoadingBlock label="Loading Products…" /> : null}
      {state.status === "error" ? (
        <>
          <Title>{errorHeading(state.error.kind)}</Title>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label="Try again" onPress={reload} />
          ) : null}
        </>
      ) : null}
      {state.status === "success" ? (
        <SelectField
          label="Product"
          options={productOptions}
          selected={selectedProductId}
          onSelect={setSelectedProductId}
          testIDPrefix="promotion-target-product"
          emptyLabel={search ? "No Products match this search." : "No Products are available."}
        />
      ) : null}
      {selectedProductId ? (
        <SelectedProductTarget
          key={selectedProductId}
          client={client}
          productId={selectedProductId}
          product={
            state.status === "success"
              ? state.data.find((item) => item.id === selectedProductId)
              : undefined
          }
          onAdd={addChoice}
        />
      ) : null}
    </View>
  );
}

function SelectedProductTarget({
  client,
  productId,
  product,
  onAdd,
}: {
  client: Pick<PromotionClient, "getProduct">;
  productId: string;
  product: ProductListResponse["items"][number] | undefined;
  onAdd: (choice: PromotionTargetChoice) => void;
}) {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const load = useCallback(() => client.getProduct(productId), [client, productId]);
  const { state, reload } = useAsync<ProductDetailResponse>(load);
  const productName = product?.name ?? "Selected Product";

  return (
    <View style={{ gap: 12 }}>
      <PrimaryButton
        label={`Add whole Product · ${productName}`}
        testID="promotion-target-add-product"
        onPress={() => onAdd({ target: { productId, variantId: null }, label: productName })}
      />
      {state.status === "loading" ? <LoadingBlock label="Loading Variants…" /> : null}
      {state.status === "error" ? (
        <>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label="Retry Variants" onPress={reload} />
          ) : null}
        </>
      ) : null}
      {state.status === "success" ? (
        <>
          <SelectField
            label="Variant"
            options={state.data.variants.map((variant) => ({
              value: variant.id,
              label: `${variant.displayName ?? variant.sku} · ${variant.sku}`,
            }))}
            selected={selectedVariantId}
            onSelect={setSelectedVariantId}
            testIDPrefix="promotion-target-variant"
            emptyLabel="This Product has no Variants."
          />
          <PrimaryButton
            label="Add selected Variant"
            testID="promotion-target-add-variant"
            disabled={!selectedVariantId}
            onPress={() => {
              const variant = state.data.variants.find((item) => item.id === selectedVariantId);
              if (!variant) return;
              onAdd({
                target: { productId: null, variantId: variant.id },
                label: `${productName} · ${variant.displayName ?? variant.sku}`,
              });
            }}
          />
        </>
      ) : null}
    </View>
  );
}

function targetKey(choice: PromotionTargetChoice): string {
  return choice.target.productId ?? (choice.target.variantId as string);
}
