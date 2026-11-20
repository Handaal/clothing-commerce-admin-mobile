import type {
  ProductDetailResponse,
  TenantCommerceClient,
  VendorListResponse,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { setProductVendor } from "../catalog/operations";
import { useI18n } from "../i18n";
import type { IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  LoadingBlock,
  Notice,
  PrimaryButton,
  SectionHeading,
  SelectField,
  TextButton,
} from "../ui/components";
import { spacing } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import { CatalogWriteError, useOnSuccess } from "./catalog-write-ui";

/** Choose the label this product is made by (SDK 0.50 vendor), e.g. Zara. Shoppers filter by it. */
export function ProductBrandForm({
  client,
  data,
  generateKey,
  reload,
}: {
  client: TenantCommerceClient;
  data: ProductDetailResponse;
  generateKey: IdempotencyKeyFactory;
  reload: () => void;
}) {
  const { t } = useI18n();
  const load = useCallback(() => client.listVendors(), [client]);
  const { state, reload: reloadVendors } = useAsync<VendorListResponse>(load);
  const [selected, setSelected] = useState<string>(data.vendorId ?? "");
  const mutation = useMutation(
    (vendorId: string | null, key) =>
      setProductVendor(client, { productId: data.product.id, vendorId }, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => reload());

  if (state.status === "loading") return <LoadingBlock label={t("brand.loading")} />;
  if (state.status === "error") {
    return (
      <Notice
        tone="danger"
        message={t("brand.loadError")}
        action={<TextButton label={t("common.retry")} icon="refresh" onPress={reloadVendors} />}
      />
    );
  }
  const vendors = state.data.vendors.filter(
    (vendor) => vendor.status === "active" || vendor.id === data.vendorId,
  );
  if (vendors.length === 0) {
    return <Notice message={t("brand.noneYet")} testID="pb-empty" />;
  }
  const options = [
    { value: "", label: t("brand.noBrand") },
    ...vendors.map((vendor) => ({
      value: vendor.id,
      label:
        vendor.status === "archived"
          ? t("po.archivedCategory", { name: vendor.name })
          : vendor.name,
    })),
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeading title={t("brand.productTitle")} detail={t("brand.productDesc")} />
      <SelectField
        label={t("brand.field")}
        options={options}
        selected={selected}
        onSelect={(next) => {
          setSelected(next);
          mutation.reset();
        }}
        testIDPrefix="pb-select"
      />
      {mutation.state.status === "success" ? (
        <Notice tone="success" message={t("brand.saved")} testID="pb-success" />
      ) : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError state={mutation.state} mutation={mutation} onRefresh={reload} />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? t("po.saving") : t("brand.saveProduct")}
        icon="content-save-outline"
        testID="pb-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={() => mutation.submit(selected || null)}
      />
    </View>
  );
}
