import type { ProductDetailResponse, ProductListResponse } from "@shifted/clothing-commerce-sdk";
import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { useI18n } from "../i18n";
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
  const { t } = useI18n();
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
      <Title>{t("promoTgt.selectedTitle")}</Title>
      {choices.length === 0 ? <Body>{t("promoTgt.none")}</Body> : null}
      {choices.map((choice) => (
        <SurfaceRow key={targetKey(choice)} testID={`promotion-target-${targetKey(choice)}`}>
          <InfoRow
            label={choice.target.productId ? t("promoTgt.product") : t("promoTgt.variant")}
            value={choice.label}
          />
          <TextButton
            label={t("promoTgt.remove")}
            onPress={() =>
              onChange(choices.filter((existing) => targetKey(existing) !== targetKey(choice)))
            }
          />
        </SurfaceRow>
      ))}
      <Divider />
      <TextField
        label={t("promoTgt.searchProducts")}
        value={search}
        onChangeText={setSearch}
        placeholder={t("promoTgt.searchPlaceholder")}
        testID="promotion-target-search"
      />
      {state.status === "loading" ? <LoadingBlock label={t("promoTgt.loadingProducts")} /> : null}
      {state.status === "error" ? (
        <>
          <Title>{errorHeading(state.error.kind)}</Title>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label={t("common.tryAgain")} onPress={reload} />
          ) : null}
        </>
      ) : null}
      {state.status === "success" ? (
        <SelectField
          label={t("promoTgt.product")}
          options={productOptions}
          selected={selectedProductId}
          onSelect={setSelectedProductId}
          testIDPrefix="promotion-target-product"
          emptyLabel={search ? t("promoTgt.noMatch") : t("promoTgt.noProducts")}
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
  const { t } = useI18n();
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const load = useCallback(() => client.getProduct(productId), [client, productId]);
  const { state, reload } = useAsync<ProductDetailResponse>(load);
  const productName = product?.name ?? t("promoTgt.selectedProduct");

  return (
    <View style={{ gap: 12 }}>
      <PrimaryButton
        label={t("promoTgt.addWholeProduct", { name: productName })}
        testID="promotion-target-add-product"
        onPress={() => onAdd({ target: { productId, variantId: null }, label: productName })}
      />
      {state.status === "loading" ? <LoadingBlock label={t("promoTgt.loadingVariants")} /> : null}
      {state.status === "error" ? (
        <>
          <Body>{state.error.message}</Body>
          {isRetryable(state.error.kind) ? (
            <PrimaryButton label={t("promoTgt.retryVariants")} onPress={reload} />
          ) : null}
        </>
      ) : null}
      {state.status === "success" ? (
        <>
          <SelectField
            label={t("promoTgt.variant")}
            options={state.data.variants.map((variant) => ({
              value: variant.id,
              label: `${variant.displayName ?? variant.sku} · ${variant.sku}`,
            }))}
            selected={selectedVariantId}
            onSelect={setSelectedVariantId}
            testIDPrefix="promotion-target-variant"
            emptyLabel={t("promoTgt.noVariants")}
          />
          <PrimaryButton
            label={t("promoTgt.addVariant")}
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
