import type { ProductDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import {
  catalogObservations,
  describePublication,
  useProductObservation,
  type CatalogObservationStore,
} from "../catalog/observations";
import {
  prepareMediaUpload,
  webImagePicker,
  MediaStorageUnavailableError,
  type ImagePicker,
  type PickedImage,
} from "../catalog/media";
import {
  archiveProductMedia,
  createVariant,
  publishProduct,
  registerProductMedia,
  setProductStatus,
  setVariantPrice,
  slugify,
  unpublishProduct,
  updateProduct,
  validateProductName,
  validateSku,
  validateSlug,
  validateStyleCode,
  type ProductStatus,
} from "../catalog/operations";
import { formatMinorToInput, parseAmountToMinor } from "../catalog/money";
import { describeCatalogWriteError } from "../catalog/write-errors";
import { OPERATING_CURRENCY } from "../commerce/currency";
import { classifyCommerceError } from "../commerce/errors";
import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { useSession } from "../session/SessionProvider";
import { AppIcon, type AppIconName } from "../ui/Icon";
import {
  AccordionTrigger,
  Badge,
  Body,
  ConfirmButton,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  SelectField,
  Surface,
  type SelectOption,
  TextButton,
  TextField,
} from "../ui/components";
import { colors, radius, spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { useToast } from "../ui/Toast";
import { useMutation, type Mutation, type MutationState } from "../ui/useMutation";
import { errorHeading, formatMoneyMinor, isRetryable } from "./display";

export interface ProductManageScreenProps {
  tenantId: string;
  productId: string;
  onBack: () => void;
  /** Test seams. */
  generateIdempotencyKey?: IdempotencyKeyFactory;
  observationStore?: CatalogObservationStore;
  imagePicker?: ImagePicker;
  uploadFetch?: typeof globalThis.fetch;
}

/**
 * Full management surface for one product. `GET /products/{id}` returns id/name/styleCode/status,
 * variants, options and prices — but NOT the storefront publication state, slug, or description, so
 * those are surfaced from this session's observations (see catalog/observations). Every write goes only
 * through the SDK, carries a stable idempotency key, and re-reads the authoritative product on success.
 *
 * Catalog capability data in `/me/context` has only `canRead` — there is no author/publish flag (unlike
 * inventory's `write.*`). So write controls cannot be pre-hidden per capability; the server authorizes
 * every write and a real 403 is surfaced as an explicit "Not authorized" state that says nothing was
 * applied.
 */
export function ProductManageScreen(props: ProductManageScreenProps) {
  const { tenantId, productId, onBack } = props;
  const { getTenantClient } = useSession();
  const { t } = useI18n();
  const client = getTenantClient(tenantId);
  const load = useCallback(() => client.getProduct(productId), [client, productId]);
  const { state, reload } = useAsync<ProductDetailResponse>(load);

  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("products.eyebrow")}
          title={t("pm.productTitle")}
          description={t("pm.loadingDesc")}
          icon="tshirt-crew-outline"
          onBack={onBack}
        />
        <LoadingBlock label={t("pm.loading")} />
      </ScrollScreen>
    );
  }

  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("products.eyebrow")}
          title={t("pm.unavailable")}
          icon="alert-circle-outline"
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

  return <ProductManage {...props} client={client} data={state.data} reload={reload} />;
}

type Section = "details" | "variants" | "media" | "lifecycle";

function ProductManage({
  productId,
  onBack,
  data,
  client,
  reload,
  generateIdempotencyKey,
  observationStore = catalogObservations,
  imagePicker = webImagePicker,
  uploadFetch,
}: ProductManageScreenProps & {
  client: TenantCommerceClient;
  data: ProductDetailResponse;
  reload: () => void;
}) {
  const generateKey = generateIdempotencyKey ?? secureIdempotencyKey;
  const { t } = useI18n();
  const observation = useProductObservation(productId, observationStore);
  const [section, setSection] = useState<Section | null>(null);
  const { product } = data;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("products.eyebrow")}
        title={product.name}
        description={t("pm.manageDesc")}
        icon="tshirt-crew-outline"
        onBack={onBack}
      />
      <Surface tone="brand" style={productStyles.summaryCard}>
        <View style={productStyles.summaryTop}>
          <View style={productStyles.summaryIcon}>
            <AppIcon name="tshirt-crew-outline" size={30} color={colors.white} />
          </View>
          <View style={productStyles.summaryCopy}>
            <Text style={productStyles.summaryName}>{product.name}</Text>
            <Text style={productStyles.summaryMeta}>
              {product.styleCode ? t("pm.style", { code: product.styleCode }) : t("pm.noStyleCode")}
            </Text>
          </View>
        </View>
        <View style={productStyles.badges}>
          <Badge label={t("pm.internalStatus", { status: product.status })} testID="detail-status" />
          <Badge
            label={
              observation?.storefrontStatus
                ? t("pm.storefrontBadge", { status: observation.storefrontStatus })
                : t("pm.storefrontUnknown")
            }
            testID="detail-storefront-status"
          />
        </View>
        <Body testID="publication-summary">{describePublication(observation)}</Body>
      </Surface>

      <View style={productStyles.metrics}>
        <MetricCard label={t("pm.variantsMetric")} value={String(data.variants.length)} icon="shape-outline" />
        <MetricCard
          label={t("pm.pricesMetric")}
          value={String(data.prices.length)}
          icon="cash-multiple"
          tone="accent"
        />
      </View>

      <Notice message={t("pm.lifecycleSeparation")} />

      <PublicationSection
        client={client}
        productId={productId}
        generateKey={generateKey}
        reload={reload}
        observationStore={observationStore}
      />

      <SectionHeading title={t("pm.manageTitle")} detail={t("pm.chooseSection")} />
      <SectionTab
        label={t("pm.editDetails")}
        description={t("pm.editDetailsDesc")}
        icon="pencil-outline"
        testID="section-details"
        active={section === "details"}
        onPress={() => setSection(section === "details" ? null : "details")}
      />
      {section === "details" ? (
        <Surface style={productStyles.expandedSection}>
          <EditDetailsForm
            client={client}
            product={product}
            observedSlug={observation?.slug}
            generateKey={generateKey}
            reload={reload}
            observationStore={observationStore}
          />
        </Surface>
      ) : null}

      <SectionTab
        label={t("pm.variantsPrices")}
        description={t("pm.variantsPricesDesc")}
        icon="shape-outline"
        testID="section-variants"
        active={section === "variants"}
        onPress={() => setSection(section === "variants" ? null : "variants")}
      />
      {section === "variants" ? (
        <Surface style={productStyles.expandedSection}>
          <VariantsSection client={client} data={data} generateKey={generateKey} reload={reload} />
        </Surface>
      ) : null}

      <SectionTab
        label={t("pm.media")}
        description={t("pm.mediaDesc")}
        icon="image-multiple-outline"
        testID="section-media"
        active={section === "media"}
        onPress={() => setSection(section === "media" ? null : "media")}
      />
      {section === "media" ? (
        <Surface style={productStyles.expandedSection}>
          <MediaSection
            client={client}
            productId={productId}
            generateKey={generateKey}
            reload={reload}
            imagePicker={imagePicker}
            uploadFetch={uploadFetch}
          />
        </Surface>
      ) : null}

      <SectionTab
        label={t("pm.lifecycle")}
        description={t("pm.lifecycleDesc")}
        icon="timeline-clock-outline"
        testID="section-lifecycle"
        active={section === "lifecycle"}
        onPress={() => setSection(section === "lifecycle" ? null : "lifecycle")}
      />
      {section === "lifecycle" ? (
        <Surface style={productStyles.expandedSection}>
          <LifecycleSection
            client={client}
            productId={productId}
            status={product.status}
            generateKey={generateKey}
            reload={reload}
            observationStore={observationStore}
          />
        </Surface>
      ) : null}
    </ScrollScreen>
  );
}

function SectionTab({
  label,
  description,
  icon,
  testID,
  active,
  onPress,
}: {
  label: string;
  description: string;
  icon: AppIconName;
  testID: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <AccordionTrigger
      title={label}
      description={description}
      icon={icon}
      expanded={active}
      testID={testID}
      onPress={onPress}
    />
  );
}

/** Run a callback once when a mutation transitions to success (used to re-read the product). */
function useOnSuccess<T>(state: MutationState<T>, onSuccess: (data: T) => void) {
  const latest = useRef(onSuccess);
  useEffect(() => {
    latest.current = onSuccess;
  });
  useEffect(() => {
    if (state.status === "success") latest.current(state.data);
  }, [state]);
}

/**
 * Shared error panel for catalog writes. `refresh` recovery re-reads the product (state drift); `retry`
 * reuses the same idempotency key (ambiguous outcome); `edit`/`none` just dismiss so the manager can
 * correct inputs and submit a genuinely new operation.
 */
function CatalogWriteError<TArgs, TResult>({
  state,
  mutation,
  onRefresh,
  testID,
}: {
  state: Extract<MutationState<TResult>, { status: "error" }>;
  mutation: Mutation<TArgs, TResult>;
  onRefresh: () => void;
  testID?: string;
}) {
  const { t } = useI18n();
  const described = describeCatalogWriteError(state.error);
  return (
    <Notice
      tone="danger"
      title={described.heading}
      message={described.message}
      testID={testID ?? "write-error"}
      action={
        described.recovery === "retry" ? (
          <TextButton
            label={t("common.retry")}
            icon="refresh"
            testID="write-retry"
            onPress={() => mutation.retry()}
          />
        ) : described.recovery === "refresh" ? (
          <TextButton
            label={t("pm.refreshProduct")}
            icon="refresh"
            testID="write-refresh"
            onPress={() => {
              mutation.reset();
              onRefresh();
            }}
          />
        ) : (
          <TextButton label={t("common.dismiss")} icon="close" onPress={() => mutation.reset()} />
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------------------------------

function PublicationSection({
  client,
  productId,
  generateKey,
  reload,
  observationStore,
}: {
  client: TenantCommerceClient;
  productId: string;
  generateKey: IdempotencyKeyFactory;
  reload: () => void;
  observationStore: CatalogObservationStore;
}) {
  const observation = useProductObservation(productId, observationStore);
  const isPublished = observation?.storefrontStatus === "published";
  const toast = useToast();
  const { t } = useI18n();
  const toastWriteError = (error: Parameters<typeof describeCatalogWriteError>[0]) => {
    const described = describeCatalogWriteError(error);
    toast.error(described.message, { title: described.heading });
  };

  const publish = useMutation(
    (_args: Record<string, never>, key) => publishProduct(client, productId, key),
    generateKey,
    { onError: toastWriteError },
  );
  const unpublish = useMutation(
    (_args: Record<string, never>, key) => unpublishProduct(client, productId, key),
    generateKey,
    { onError: toastWriteError },
  );

  useOnSuccess(publish.state, (data) => {
    observationStore.record(productId, {
      storefrontStatus: data.storefrontStatus,
      publishedAt: data.publishedAt,
    });
    toast.success(t("pm.publishedToast"), { title: t("pm.publishedTitle") });
    reload();
  });
  useOnSuccess(unpublish.state, (data) => {
    observationStore.record(productId, { storefrontStatus: data.storefrontStatus });
    toast.success(t("pm.unpublishedToast"), { title: t("pm.unpublishedTitle") });
    reload();
  });

  const busy = publish.state.status === "submitting" || unpublish.state.status === "submitting";

  return (
    <Surface tone="accent" style={productStyles.publicationCard}>
      <View style={productStyles.sectionIntro}>
        <View style={productStyles.accentIcon}>
          <AppIcon name="storefront-outline" size={23} color={colors.accent} />
        </View>
        <View style={productStyles.sectionIntroCopy}>
          <Text style={productStyles.sectionTitle}>{t("pm.storefrontPublication")}</Text>
          <Text style={productStyles.sectionDescription}>{t("pm.storefrontControl")}</Text>
        </View>
      </View>
      <Body>{t("pm.publishBody")}</Body>
      <PrimaryButton
        label={
          publish.state.status === "submitting"
            ? t("pm.publishing")
            : unpublish.state.status === "submitting"
              ? t("pm.unpublishing")
              : isPublished
                ? t("pm.publishAgain")
                : t("pm.publish")
        }
        icon="web-plus"
        testID="publish-submit"
        disabled={busy}
        onPress={() => publish.submit({})}
      />
      {observation?.storefrontStatus === "published" || isPublished ? (
        <PrimaryButton
          label={t("pm.unpublish")}
          icon="web-remove"
          variant="secondary"
          testID="unpublish-submit"
          disabled={busy}
          onPress={() => unpublish.submit({})}
        />
      ) : null}
      {publish.state.status === "success" ? (
        <Notice tone="success" testID="publish-success" message={t("pm.publishedMsg")} />
      ) : null}
      {unpublish.state.status === "success" ? (
        <Notice tone="success" testID="unpublish-success" message={t("pm.unpublishedMsg")} />
      ) : null}
      {publish.state.status === "error" ? (
        <CatalogWriteError
          state={publish.state}
          mutation={publish}
          onRefresh={reload}
          testID="publish-error"
        />
      ) : null}
      {unpublish.state.status === "error" ? (
        <CatalogWriteError
          state={unpublish.state}
          mutation={unpublish}
          onRefresh={reload}
          testID="unpublish-error"
        />
      ) : null}
    </Surface>
  );
}

// ---------------------------------------------------------------------------------------------------
// Edit details
// ---------------------------------------------------------------------------------------------------

function EditDetailsForm({
  client,
  product,
  observedSlug,
  generateKey,
  reload,
  observationStore,
}: {
  client: TenantCommerceClient;
  product: ProductDetailResponse["product"];
  observedSlug: string | undefined;
  generateKey: IdempotencyKeyFactory;
  reload: () => void;
  observationStore: CatalogObservationStore;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(product.name);
  // The read contract returns no slug/description; seed the slug from this session's observation when
  // available, else derive a candidate from the name. `updateProduct` requires a slug either way.
  const [slug, setSlug] = useState(observedSlug ?? slugify(product.name));
  const [styleCode, setStyleCode] = useState(product.styleCode ?? "");
  const [description, setDescription] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation(
    (
      args: {
        productId: string;
        name: string;
        slug: string;
        styleCode?: string;
        description?: string;
      },
      key,
    ) => updateProduct(client, args, key),
    generateKey,
  );

  useOnSuccess(mutation.state, () => {
    observationStore.record(product.id, { slug: slug.trim() });
    reload();
  });

  function onSubmit() {
    const problem = validateProductName(name) ?? validateSlug(slug) ?? validateStyleCode(styleCode);
    setLocalError(problem);
    if (problem) return;
    mutation.submit({
      productId: product.id,
      name: name.trim(),
      slug: slug.trim(),
      ...(styleCode.trim() ? { styleCode: styleCode.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  }

  return (
    <View style={productStyles.sectionBody}>
      {observedSlug === undefined ? (
        <Notice tone="warning" message={t("pm.slugDescNote")} />
      ) : null}
      <TextField label={t("pm.name")} value={name} onChangeText={setName} testID="edit-name" />
      <TextField
        label={t("pm.slug")}
        value={slug}
        onChangeText={setSlug}
        testID="edit-slug"
        autoCapitalize="none"
      />
      <TextField
        label={t("pm.styleCode")}
        value={styleCode}
        onChangeText={setStyleCode}
        testID="edit-style-code"
        autoCapitalize="characters"
      />
      <TextField
        label={t("pm.description")}
        value={description}
        onChangeText={setDescription}
        testID="edit-description"
        multiline
      />
      {localError ? <Notice tone="danger" message={localError} /> : null}
      {mutation.state.status === "success" ? (
        <Notice tone="success" message={t("pm.saved")} testID="edit-success" />
      ) : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError
          state={mutation.state}
          mutation={mutation}
          onRefresh={reload}
          testID="edit-error"
        />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? t("pm.saving") : t("pm.saveDetails")}
        icon="content-save-outline"
        testID="edit-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// Variants & prices
// ---------------------------------------------------------------------------------------------------

function VariantsSection({
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
  const { product, variants, prices } = data;
  const priceByVariant = useMemo(() => {
    const map = new Map<string, { currency: string; amountMinor: number }>();
    for (const price of prices) {
      if (!map.has(price.variantId)) {
        map.set(price.variantId, { currency: price.currency, amountMinor: price.amountMinor });
      }
    }
    return map;
  }, [prices]);

  return (
    <View style={productStyles.sectionBody}>
      <Eyebrow>{t("pm.variantsCount", { count: variants.length })}</Eyebrow>
      {variants.length === 0 ? (
        <Notice tone="warning" message={t("pm.noVariants")} />
      ) : (
        <View style={productStyles.variantList}>
          {variants.map((variant) => {
            const price = priceByVariant.get(variant.id);
            return (
              <Surface
                key={variant.id}
                testID={`variant-${variant.id}`}
                tone="muted"
                style={productStyles.variantCard}
              >
                <View style={productStyles.variantTop}>
                  <View style={productStyles.variantIcon}>
                    <AppIcon name="shape-outline" size={20} color={colors.brand} />
                  </View>
                  <Text style={productStyles.variantName}>
                    {variant.displayName ?? variant.sku}
                  </Text>
                  <Badge label={variant.status} />
                </View>
                <InfoRow label="SKU" value={variant.sku} />
                <InfoRow
                  label="Price"
                  value={price ? formatMoneyMinor(price.amountMinor, price.currency) : "Not set"}
                />
              </Surface>
            );
          })}
        </View>
      )}
      <Divider />
      <CreateVariantForm
        client={client}
        productId={product.id}
        generateKey={generateKey}
        reload={reload}
      />
      <Divider />
      <SetPriceForm
        client={client}
        variants={variants}
        priceByVariant={priceByVariant}
        generateKey={generateKey}
        reload={reload}
      />
    </View>
  );
}

function CreateVariantForm({
  client,
  productId,
  generateKey,
  reload,
}: {
  client: TenantCommerceClient;
  productId: string;
  generateKey: IdempotencyKeyFactory;
  reload: () => void;
}) {
  const { t } = useI18n();
  const [sku, setSku] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation(
    (args: { productId: string; sku: string; displayName?: string }, key) =>
      createVariant(client, args, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => reload());

  function onSubmit() {
    const problem = validateSku(sku);
    setLocalError(problem);
    if (problem) return;
    mutation.submit({
      productId,
      sku: sku.trim(),
      ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
    });
  }

  return (
    <View style={productStyles.sectionBody}>
      <SectionHeading title={t("pm.addVariant")} detail={t("pm.newSku")} />
      <TextField
        label={t("pm.sku")}
        value={sku}
        onChangeText={setSku}
        placeholder={t("pm.skuPlaceholder")}
        testID="variant-sku"
        autoCapitalize="characters"
      />
      <TextField
        label={t("pm.displayName")}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={t("pm.displayNamePlaceholder")}
        testID="variant-display-name"
      />
      {localError ? <Notice tone="danger" message={localError} /> : null}
      {mutation.state.status === "success" ? (
        <Notice tone="success" message={t("pm.variantAdded")} testID="variant-success" />
      ) : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError
          state={mutation.state}
          mutation={mutation}
          onRefresh={reload}
          testID="variant-error"
        />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? t("pm.adding") : t("pm.addVariantCta")}
        icon="plus"
        testID="variant-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </View>
  );
}

function SetPriceForm({
  client,
  variants,
  priceByVariant,
  generateKey,
  reload,
}: {
  client: TenantCommerceClient;
  variants: ProductDetailResponse["variants"];
  priceByVariant: Map<string, { currency: string; amountMinor: number }>;
  generateKey: IdempotencyKeyFactory;
  reload: () => void;
}) {
  const { t } = useI18n();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  // Currency is locked to the single operating currency; it is submitted as-is and shown read-only.
  const [currency] = useState(OPERATING_CURRENCY);
  const [localError, setLocalError] = useState<string | null>(null);

  // Seed the amount field from the current price when a variant is chosen so an edit starts from
  // today's value. The currency is fixed to the operating currency and never changes per variant.
  const onSelectVariant = (id: string) => {
    setVariantId(id);
    const existing = priceByVariant.get(id);
    setAmount(existing ? formatMinorToInput(existing.amountMinor) : "");
  };

  const mutation = useMutation(
    (args: { variantId: string; currency: string; amountMinor: number }, key) =>
      setVariantPrice(client, args, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => reload());

  const variantOptions = useMemo<SelectOption[]>(
    () => variants.map((v) => ({ value: v.id, label: v.displayName ?? v.sku })),
    [variants],
  );

  function onSubmit() {
    if (!variantId) {
      setLocalError(t("pm.chooseVariantToPrice"));
      return;
    }
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setLocalError(t("pm.currencyCode"));
      return;
    }
    const parsed = parseAmountToMinor(amount);
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    setLocalError(null);
    mutation.submit({ variantId, currency: normalizedCurrency, amountMinor: parsed.amountMinor });
  }

  return (
    <View style={productStyles.sectionBody}>
      <SectionHeading title={t("pm.setPrice")} detail={t("pm.currentPrice")} />
      {variants.length === 0 ? (
        <Notice message={t("pm.addVariantFirst")} />
      ) : (
        <>
          <SelectField
            label={t("pm.variant")}
            options={variantOptions}
            selected={variantId}
            onSelect={onSelectVariant}
            testIDPrefix="price-variant"
          />
          <InfoRow label={t("pm.currency")} value={currency} testID="price-currency" />
          <TextField
            label={t("pm.amount")}
            value={amount}
            onChangeText={setAmount}
            placeholder={t("pm.amountPlaceholder")}
            testID="price-amount"
          />
          {localError ? <Notice tone="danger" message={localError} /> : null}
          {mutation.state.status === "success" ? (
            <Notice
              tone="success"
              testID="price-success"
              message={t("pm.priceSetMsg", {
                amount: formatMoneyMinor(
                  mutation.state.data.amountMinor,
                  mutation.state.data.currency,
                ),
              })}
            />
          ) : null}
          {mutation.state.status === "error" ? (
            <CatalogWriteError
              state={mutation.state}
              mutation={mutation}
              onRefresh={reload}
              testID="price-error"
            />
          ) : null}
          <PrimaryButton
            label={mutation.state.status === "submitting" ? t("pm.saving") : t("pm.setPriceCta")}
            icon="cash-check"
            testID="price-submit"
            disabled={mutation.state.status === "submitting"}
            onPress={onSubmit}
          />
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------------------------------

interface RegisteredMedia {
  mediaId: string;
  isPrimary: boolean;
  previewUri?: string;
  altText?: string;
}

function MediaSection({
  client,
  productId,
  generateKey,
  reload,
  imagePicker,
  uploadFetch,
}: {
  client: TenantCommerceClient;
  productId: string;
  generateKey: IdempotencyKeyFactory;
  reload: () => void;
  imagePicker: ImagePicker;
  uploadFetch?: typeof globalThis.fetch;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [altText, setAltText] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  // Media is NOT returned by the authenticated read contract, so we list what was registered this
  // session (verify the full set via the published Storefront projection).
  const [registered, setRegistered] = useState<RegisteredMedia[]>([]);

  const register = useMutation(
    (
      args: {
        productId: string;
        bucket: string;
        path: string;
        altText?: string;
        isPrimary?: boolean;
      },
      key,
    ) => registerProductMedia(client, args, key),
    generateKey,
  );
  const archive = useMutation(
    (args: { productId: string; mediaId: string }, key) => archiveProductMedia(client, args, key),
    generateKey,
  );

  // Media is NOT part of the authenticated product read, so a getProduct reload would show nothing new
  // for media and would only flash the screen back to loading (dropping this session list). The
  // register/archive responses ARE the authoritative confirmation; we keep the session list from them.
  // (`reload` is still used for MEDIA_NOT_FOUND refresh recovery in the error panel.)
  useOnSuccess(register.state, (data) => {
    setRegistered((prev) => [
      ...prev,
      {
        mediaId: data.mediaId,
        isPrimary: data.isPrimary,
        previewUri: picked?.previewUri,
        altText: altText.trim() || undefined,
      },
    ]);
    setPicked(null);
    setAltText("");
    setIsPrimary(false);
  });
  useOnSuccess(archive.state, (data) => {
    setRegistered((prev) => prev.filter((m) => m.mediaId !== data.mediaId));
  });

  async function onPick() {
    setPrepareError(null);
    const image = await imagePicker();
    if (image) setPicked(image);
  }

  async function onUpload() {
    if (!picked) return;
    setPreparing(true);
    setPrepareError(null);
    try {
      const prepared = await prepareMediaUpload(
        client,
        { productId, image: picked },
        uploadFetch ?? globalThis.fetch,
      );
      register.submit({
        productId,
        bucket: prepared.bucket,
        path: prepared.path,
        ...(altText.trim() ? { altText: altText.trim() } : {}),
        isPrimary,
      });
    } catch (error) {
      if (error instanceof MediaStorageUnavailableError) {
        setPrepareError(error.message);
      } else {
        setPrepareError(classifyCommerceError(error).message);
      }
    } finally {
      setPreparing(false);
    }
  }

  return (
    <View style={productStyles.sectionBody}>
      <Eyebrow>{t("pm.productMedia")}</Eyebrow>
      <Body>{t("pm.mediaIntro")}</Body>
      {registered.length > 0 ? (
        <View style={productStyles.mediaList}>
          {registered.map((media) => (
            <Surface
              key={media.mediaId}
              testID={`media-${media.mediaId}`}
              tone="muted"
              style={productStyles.mediaCard}
            >
              {media.previewUri ? (
                <Image
                  source={{ uri: media.previewUri }}
                  style={productStyles.mediaThumbnail}
                  accessibilityLabel={media.altText ?? t("pm.productImageAlt")}
                />
              ) : null}
              <View style={productStyles.mediaMeta}>
                {media.isPrimary ? <Badge label={t("pm.primary")} /> : null}
                <Body>{media.altText ?? media.mediaId}</Body>
              </View>
              <ConfirmButton
                label={t("pm.removeImage")}
                confirmLabel={t("pm.confirmRemove")}
                testID={`media-archive-${media.mediaId}`}
                disabled={archive.state.status === "submitting"}
                onConfirm={() => archive.submit({ productId, mediaId: media.mediaId })}
              />
            </Surface>
          ))}
        </View>
      ) : null}

      <Divider />
      <SectionHeading title={t("pm.addImage")} detail={t("pm.imageFormats")} />
      <PrimaryButton
        label={picked ? t("pm.chooseDifferent") : t("pm.chooseImage")}
        icon="image-plus"
        variant="secondary"
        testID="media-pick"
        onPress={() => void onPick()}
      />
      {picked ? (
        <>
          {picked.previewUri ? (
            <Image
              source={{ uri: picked.previewUri }}
              style={productStyles.mediaPreview}
              accessibilityLabel={t("pm.selectedPreview")}
            />
          ) : null}
          <Body testID="media-picked">
            {t("pm.selected", { name: picked.fileName ?? picked.contentType })}
          </Body>
          <TextField
            label={t("pm.altText")}
            value={altText}
            onChangeText={setAltText}
            testID="media-alt"
          />
          <SelectField
            label={t("pm.primaryImage")}
            options={[
              { value: "no", label: t("pm.primaryNo") },
              { value: "yes", label: t("pm.primaryYes") },
            ]}
            selected={isPrimary ? "yes" : "no"}
            onSelect={(v) => setIsPrimary(v === "yes")}
            testIDPrefix="media-primary"
          />
          <PrimaryButton
            label={
              preparing
                ? t("pm.uploading")
                : register.state.status === "submitting"
                  ? t("pm.registering")
                  : t("pm.uploadRegister")
            }
            icon="cloud-upload-outline"
            testID="media-upload"
            disabled={preparing || register.state.status === "submitting"}
            onPress={() => void onUpload()}
          />
        </>
      ) : null}
      {prepareError ? (
        <Notice
          tone="danger"
          title={t("pm.imageNotUploaded")}
          message={prepareError}
          testID="media-prepare-error"
        />
      ) : null}
      {register.state.status === "success" ? (
        <Notice tone="success" message={t("pm.imageRegistered")} testID="media-success" />
      ) : null}
      {register.state.status === "error" ? (
        <CatalogWriteError
          state={register.state}
          mutation={register}
          onRefresh={reload}
          testID="media-error"
        />
      ) : null}
      {archive.state.status === "error" ? (
        <CatalogWriteError
          state={archive.state}
          mutation={archive}
          onRefresh={reload}
          testID="media-archive-error"
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------------------------

/** Valid internal status transitions, mirrored from the contract's draft/active/archived model. The
 * server remains authoritative and rejects anything invalid with INVALID_LIFECYCLE_TRANSITION. */
function nextStatuses(status: ProductStatus): ProductStatus[] {
  switch (status) {
    case "draft":
      return ["active", "archived"];
    case "active":
      return ["draft", "archived"];
    case "archived":
      return ["draft"];
  }
}

function LifecycleSection({
  client,
  productId,
  status,
  generateKey,
  reload,
  observationStore,
}: {
  client: TenantCommerceClient;
  productId: string;
  status: ProductStatus;
  generateKey: IdempotencyKeyFactory;
  reload: () => void;
  observationStore: CatalogObservationStore;
}) {
  const { t } = useI18n();
  const [archiveReason, setArchiveReason] = useState("");
  const mutation = useMutation(
    (args: { productId: string; status: ProductStatus; archiveReason?: string }, key) =>
      setProductStatus(client, args, key),
    generateKey,
  );
  useOnSuccess(mutation.state, (data) => {
    observationStore.record(productId, {
      status: data.status,
      storefrontStatus: data.storefrontStatus,
    });
    reload();
  });

  const targets = nextStatuses(status);
  const busy = mutation.state.status === "submitting";

  return (
    <View style={productStyles.sectionBody}>
      <Eyebrow>{t("pm.lifecycle")}</Eyebrow>
      <Notice message={t("pm.currentStatusArchive", { status })} />
      {targets.includes("active") ? (
        <PrimaryButton
          label={t("pm.activate")}
          icon="check-circle-outline"
          testID="lifecycle-active"
          disabled={busy}
          onPress={() => mutation.submit({ productId, status: "active" })}
        />
      ) : null}
      {targets.includes("draft") ? (
        <PrimaryButton
          label={status === "archived" ? t("pm.restoreToDraft") : t("pm.moveToDraft")}
          icon="file-document-edit-outline"
          variant="secondary"
          testID="lifecycle-draft"
          disabled={busy}
          onPress={() => mutation.submit({ productId, status: "draft" })}
        />
      ) : null}
      {targets.includes("archived") ? (
        <>
          <TextField
            label={t("pm.archiveReason")}
            value={archiveReason}
            onChangeText={setArchiveReason}
            testID="lifecycle-archive-reason"
          />
          <ConfirmButton
            label={t("pm.archiveProduct")}
            confirmLabel={t("pm.confirmArchive")}
            testID="lifecycle-archive"
            disabled={busy}
            onConfirm={() =>
              mutation.submit({
                productId,
                status: "archived",
                ...(archiveReason.trim() ? { archiveReason: archiveReason.trim() } : {}),
              })
            }
          />
        </>
      ) : null}
      {mutation.state.status === "success" ? (
        <Notice
          tone="success"
          testID="lifecycle-success"
          message={t("pm.statusNow", { status: mutation.state.data.status })}
        />
      ) : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError
          state={mutation.state}
          mutation={mutation}
          onRefresh={reload}
          testID="lifecycle-error"
        />
      ) : null}
    </View>
  );
}

const productStyles = StyleSheet.create({
  summaryCard: { gap: spacing.lg },
  summaryTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  summaryIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
  },
  summaryCopy: { flex: 1, gap: spacing.xs },
  summaryName: { color: colors.ink, fontSize: 23, lineHeight: 29, fontWeight: "800" },
  summaryMeta: { color: colors.inkMuted, ...typography.caption },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  publicationCard: { gap: spacing.lg },
  sectionIntro: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  accentIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  sectionIntroCopy: { flex: 1, gap: 2 },
  sectionTitle: { color: colors.ink, ...typography.sectionTitle },
  sectionDescription: { color: colors.inkMuted, ...typography.caption },
  expandedSection: { borderColor: colors.brandSoftStrong, gap: spacing.lg },
  sectionBody: { gap: spacing.md },
  variantList: { gap: spacing.md },
  variantCard: { gap: spacing.sm, shadowOpacity: 0, elevation: 0 },
  variantTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  variantIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
  },
  variantName: { flex: 1, color: colors.ink, ...typography.cardTitle },
  mediaList: { gap: spacing.md },
  mediaCard: { gap: spacing.md, shadowOpacity: 0, elevation: 0 },
  mediaThumbnail: { width: 112, height: 112, borderRadius: radius.md },
  mediaPreview: { width: 152, height: 152, borderRadius: radius.lg },
  mediaMeta: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
