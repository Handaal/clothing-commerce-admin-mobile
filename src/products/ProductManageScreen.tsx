import type { ProductDetailResponse, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, View } from "react-native";

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
import { classifyCommerceError } from "../commerce/errors";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  ConfirmButton,
  Divider,
  Eyebrow,
  InfoRow,
  LoadingBlock,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  type SelectOption,
  TextButton,
  TextField,
  Title,
} from "../ui/components";
import { useAsync } from "../ui/useAsync";
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
  const observation = useProductObservation(productId, observationStore);
  const [section, setSection] = useState<Section | null>(null);
  const { product } = data;

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Catalog" title={product.name} onBack={onBack} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Badge label={`internal: ${product.status}`} testID="detail-status" />
        <Badge
          label={
            observation?.storefrontStatus
              ? `storefront: ${observation.storefrontStatus}`
              : "storefront: unknown"
          }
          testID="detail-storefront-status"
        />
      </View>
      <Body testID="publication-summary">{describePublication(observation)}</Body>
      <Body>
        Internal status (draft/active/archived) controls whether the product can be sold and
        managed. It is separate from Storefront publication, which controls whether shoppers can see
        it online. A product can be active but not published.
      </Body>
      {product.styleCode ? <InfoRow label="Style code" value={product.styleCode} /> : null}
      <InfoRow label="Product id" value={product.id} />

      <Divider />
      <PublicationSection
        client={client}
        productId={productId}
        generateKey={generateKey}
        reload={reload}
        observationStore={observationStore}
      />

      <Divider />
      <SectionTab
        label="Edit details"
        testID="section-details"
        active={section === "details"}
        onPress={() => setSection(section === "details" ? null : "details")}
      />
      {section === "details" ? (
        <EditDetailsForm
          client={client}
          product={product}
          observedSlug={observation?.slug}
          generateKey={generateKey}
          reload={reload}
          observationStore={observationStore}
        />
      ) : null}

      <SectionTab
        label="Variants & prices"
        testID="section-variants"
        active={section === "variants"}
        onPress={() => setSection(section === "variants" ? null : "variants")}
      />
      {section === "variants" ? (
        <VariantsSection client={client} data={data} generateKey={generateKey} reload={reload} />
      ) : null}

      <SectionTab
        label="Media"
        testID="section-media"
        active={section === "media"}
        onPress={() => setSection(section === "media" ? null : "media")}
      />
      {section === "media" ? (
        <MediaSection
          client={client}
          productId={productId}
          generateKey={generateKey}
          reload={reload}
          imagePicker={imagePicker}
          uploadFetch={uploadFetch}
        />
      ) : null}

      <SectionTab
        label="Lifecycle"
        testID="section-lifecycle"
        active={section === "lifecycle"}
        onPress={() => setSection(section === "lifecycle" ? null : "lifecycle")}
      />
      {section === "lifecycle" ? (
        <LifecycleSection
          client={client}
          productId={productId}
          status={product.status}
          generateKey={generateKey}
          reload={reload}
          observationStore={observationStore}
        />
      ) : null}
    </ScrollScreen>
  );
}

function SectionTab({
  label,
  testID,
  active,
  onPress,
}: {
  label: string;
  testID: string;
  active: boolean;
  onPress: () => void;
}) {
  return <PrimaryButton label={active ? `▾ ${label}` : label} testID={testID} onPress={onPress} />;
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
  const described = describeCatalogWriteError(state.error);
  return (
    <View style={{ gap: 8 }} testID={testID ?? "write-error"}>
      <Title>{described.heading}</Title>
      <Body>{described.message}</Body>
      {described.recovery === "retry" ? (
        <PrimaryButton label="Retry" testID="write-retry" onPress={() => mutation.retry()} />
      ) : null}
      {described.recovery === "refresh" ? (
        <PrimaryButton
          label="Refresh product"
          testID="write-refresh"
          onPress={() => {
            mutation.reset();
            onRefresh();
          }}
        />
      ) : null}
      {described.recovery === "edit" || described.recovery === "none" ? (
        <TextButton label="Dismiss" onPress={() => mutation.reset()} />
      ) : null}
    </View>
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

  const publish = useMutation(
    (_args: Record<string, never>, key) => publishProduct(client, productId, key),
    generateKey,
  );
  const unpublish = useMutation(
    (_args: Record<string, never>, key) => unpublishProduct(client, productId, key),
    generateKey,
  );

  useOnSuccess(publish.state, (data) => {
    observationStore.record(productId, {
      storefrontStatus: data.storefrontStatus,
      publishedAt: data.publishedAt,
    });
    reload();
  });
  useOnSuccess(unpublish.state, (data) => {
    observationStore.record(productId, { storefrontStatus: data.storefrontStatus });
    reload();
  });

  const busy = publish.state.status === "submitting" || unpublish.state.status === "submitting";

  return (
    <View style={{ gap: 12 }}>
      <Eyebrow>Storefront publication</Eyebrow>
      <Body>
        Publishing exposes this product on the public Storefront. Publishing requires the product to
        be active, with at least one active variant and a valid current price.
      </Body>
      <PrimaryButton
        label={
          publish.state.status === "submitting"
            ? "Publishing…"
            : unpublish.state.status === "submitting"
              ? "Unpublishing…"
              : isPublished
                ? "Publish again"
                : "Publish to Storefront"
        }
        testID="publish-submit"
        disabled={busy}
        onPress={() => publish.submit({})}
      />
      {observation?.storefrontStatus === "published" || isPublished ? (
        <PrimaryButton
          label="Unpublish from Storefront"
          testID="unpublish-submit"
          disabled={busy}
          onPress={() => unpublish.submit({})}
        />
      ) : null}
      {publish.state.status === "success" ? (
        <Body testID="publish-success">Published. The Storefront now shows this product.</Body>
      ) : null}
      {unpublish.state.status === "success" ? (
        <Body testID="unpublish-success">
          Unpublished. The Storefront no longer shows this product.
        </Body>
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
    </View>
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
    <View style={{ gap: 12 }}>
      {observedSlug === undefined ? (
        <Body>
          The current slug and description are not returned by the read API. Confirm the slug before
          saving; the description is only sent if you enter one.
        </Body>
      ) : null}
      <TextField label="Name" value={name} onChangeText={setName} testID="edit-name" />
      <TextField
        label="Storefront slug"
        value={slug}
        onChangeText={setSlug}
        testID="edit-slug"
        autoCapitalize="none"
      />
      <TextField
        label="Style code (optional)"
        value={styleCode}
        onChangeText={setStyleCode}
        testID="edit-style-code"
        autoCapitalize="characters"
      />
      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        testID="edit-description"
        multiline
      />
      {localError ? <Body>{localError}</Body> : null}
      {mutation.state.status === "success" ? <Body testID="edit-success">Saved.</Body> : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError
          state={mutation.state}
          mutation={mutation}
          onRefresh={reload}
          testID="edit-error"
        />
      ) : null}
      <PrimaryButton
        label={mutation.state.status === "submitting" ? "Saving…" : "Save details"}
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
    <View style={{ gap: 12 }}>
      <Eyebrow>Variants ({variants.length})</Eyebrow>
      {variants.length === 0 ? (
        <Body>No variants yet. Add one below before setting a price or publishing.</Body>
      ) : (
        <View style={{ gap: 8 }}>
          {variants.map((variant) => {
            const price = priceByVariant.get(variant.id);
            return (
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
                <InfoRow
                  label="Price"
                  value={price ? formatMoneyMinor(price.amountMinor, price.currency) : "Not set"}
                />
              </View>
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
    <View style={{ gap: 12 }}>
      <Title>Add a variant</Title>
      <TextField
        label="SKU"
        value={sku}
        onChangeText={setSku}
        placeholder="e.g. LS-001-M"
        testID="variant-sku"
        autoCapitalize="characters"
      />
      <TextField
        label="Display name (optional)"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="e.g. Medium"
        testID="variant-display-name"
      />
      {localError ? <Body>{localError}</Body> : null}
      {mutation.state.status === "success" ? (
        <Body testID="variant-success">Variant added.</Body>
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
        label={mutation.state.status === "submitting" ? "Adding…" : "Add variant"}
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
  const [variantId, setVariantId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  // Default the currency to the product's existing price currency (never a hidden hardcode). Seed the
  // amount field from the current price when a variant is chosen so an edit starts from today's value.
  const onSelectVariant = (id: string) => {
    setVariantId(id);
    const existing = priceByVariant.get(id);
    setCurrency(existing?.currency ?? "USD");
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
      setLocalError("Choose a variant to price.");
      return;
    }
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      setLocalError("Enter a 3-letter currency code (e.g. USD).");
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
    <View style={{ gap: 12 }}>
      <Title>Set a selling price</Title>
      {variants.length === 0 ? (
        <Body>Add a variant first.</Body>
      ) : (
        <>
          <SelectField
            label="Variant"
            options={variantOptions}
            selected={variantId}
            onSelect={onSelectVariant}
            testIDPrefix="price-variant"
          />
          <TextField
            label="Currency"
            value={currency}
            onChangeText={setCurrency}
            placeholder="USD"
            testID="price-currency"
            autoCapitalize="characters"
          />
          <TextField
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 25.99"
            testID="price-amount"
          />
          {localError ? <Body>{localError}</Body> : null}
          {mutation.state.status === "success" ? (
            <Body testID="price-success">
              Price set to{" "}
              {formatMoneyMinor(mutation.state.data.amountMinor, mutation.state.data.currency)}.
              This is recorded as canonical price history on the server.
            </Body>
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
            label={mutation.state.status === "submitting" ? "Saving…" : "Set price"}
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
    <View style={{ gap: 12 }}>
      <Eyebrow>Product media</Eyebrow>
      <Body>
        Images are uploaded to secure object storage via a server-issued signed URL, then registered
        with the catalog. Raw images are never stored in the API database.
      </Body>
      {registered.length > 0 ? (
        <View style={{ gap: 8 }}>
          {registered.map((media) => (
            <View key={media.mediaId} testID={`media-${media.mediaId}`} style={{ gap: 6 }}>
              {media.previewUri ? (
                <Image
                  source={{ uri: media.previewUri }}
                  style={{ width: 96, height: 96, borderRadius: 12 }}
                  accessibilityLabel={media.altText ?? "Product image"}
                />
              ) : null}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {media.isPrimary ? <Badge label="primary" /> : null}
                <Body>{media.altText ?? media.mediaId}</Body>
              </View>
              <ConfirmButton
                label="Remove image"
                confirmLabel="Confirm remove"
                testID={`media-archive-${media.mediaId}`}
                disabled={archive.state.status === "submitting"}
                onConfirm={() => archive.submit({ productId, mediaId: media.mediaId })}
              />
            </View>
          ))}
        </View>
      ) : null}

      <Divider />
      <Title>Add an image</Title>
      <PrimaryButton
        label={picked ? "Choose a different image" : "Choose image"}
        testID="media-pick"
        onPress={() => void onPick()}
      />
      {picked ? (
        <>
          {picked.previewUri ? (
            <Image
              source={{ uri: picked.previewUri }}
              style={{ width: 120, height: 120, borderRadius: 12 }}
              accessibilityLabel="Selected image preview"
            />
          ) : null}
          <Body testID="media-picked">Selected: {picked.fileName ?? picked.contentType}</Body>
          <TextField
            label="Alt text (optional)"
            value={altText}
            onChangeText={setAltText}
            testID="media-alt"
          />
          <SelectField
            label="Primary image?"
            options={[
              { value: "no", label: "No" },
              { value: "yes", label: "Yes — make this the primary image" },
            ]}
            selected={isPrimary ? "yes" : "no"}
            onSelect={(v) => setIsPrimary(v === "yes")}
            testIDPrefix="media-primary"
          />
          <PrimaryButton
            label={
              preparing
                ? "Uploading…"
                : register.state.status === "submitting"
                  ? "Registering…"
                  : "Upload and register"
            }
            testID="media-upload"
            disabled={preparing || register.state.status === "submitting"}
            onPress={() => void onUpload()}
          />
        </>
      ) : null}
      {prepareError ? (
        <View style={{ gap: 8 }} testID="media-prepare-error">
          <Title>Image not uploaded</Title>
          <Body>{prepareError}</Body>
        </View>
      ) : null}
      {register.state.status === "success" ? (
        <Body testID="media-success">Image registered.</Body>
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
    <View style={{ gap: 12 }}>
      <Eyebrow>Lifecycle</Eyebrow>
      <Body>
        Current internal status: {status}. Archiving is not a delete — the product is retained and
        can be returned to draft later.
      </Body>
      {targets.includes("active") ? (
        <PrimaryButton
          label="Activate"
          testID="lifecycle-active"
          disabled={busy}
          onPress={() => mutation.submit({ productId, status: "active" })}
        />
      ) : null}
      {targets.includes("draft") ? (
        <PrimaryButton
          label={status === "archived" ? "Restore to draft" : "Move to draft"}
          testID="lifecycle-draft"
          disabled={busy}
          onPress={() => mutation.submit({ productId, status: "draft" })}
        />
      ) : null}
      {targets.includes("archived") ? (
        <>
          <TextField
            label="Archive reason (optional)"
            value={archiveReason}
            onChangeText={setArchiveReason}
            testID="lifecycle-archive-reason"
          />
          <ConfirmButton
            label="Archive product"
            confirmLabel="Confirm archive"
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
        <Body testID="lifecycle-success">
          Status is now {mutation.state.data.status}. Storefront publication is unchanged by this
          action unless the server reports otherwise.
        </Body>
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
