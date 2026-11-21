import type { StorefrontContent, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import {
  MediaStorageUnavailableError,
  MediaUploadFailedError,
  webImagePicker,
  type ImagePicker,
  type PickedImage,
} from "../catalog/media";
import { getPublicMediaBaseUrl } from "../config/env";
import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  AsyncBlock,
  MultiPicker,
  useCatalogCollections,
  useCatalogProducts,
} from "../merchandising/pickers";
import { errorHeading, isRetryable } from "../products/display";
import { describePromotionWriteError } from "../promotions/write-errors";
import {
  Body,
  FieldError,
  FormSection,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  TextButton,
  TextField,
} from "../ui/components";
import { radius, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useToast } from "../ui/Toast";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import {
  buildContentRequest,
  contentToForm,
  MAX_FEATURED_COLLECTIONS,
  MAX_FEATURED_PRODUCTS,
  validateContentForm,
  type StorefrontContentErrors,
  type StorefrontContentForm,
} from "./content-form";

export type StorefrontContentClient = Pick<
  TenantCommerceClient,
  | "getStorefrontContent"
  | "updateStorefrontContent"
  | "createStorefrontHeroImageIntent"
  | "listProducts"
  | "listCollections"
>;

/**
 * Home-page editor: the hero (eyebrow, headline, subtitle, button, image) and the curated featured
 * products and collections, in display order. Structured content only — the website owns the layout.
 * Authorized by catalog.author (the API enforces it; the capability flag only guides the UI).
 */
export function StorefrontContentScreen({
  client,
  canManage,
  onBack,
  imagePicker = webImagePicker,
  generateIdempotencyKey = secureIdempotencyKey,
  fetchImpl = globalThis.fetch,
}: {
  client: StorefrontContentClient;
  canManage: boolean;
  onBack: () => void;
  imagePicker?: ImagePicker;
  generateIdempotencyKey?: IdempotencyKeyFactory;
  fetchImpl?: typeof globalThis.fetch;
}) {
  const { t } = useI18n();
  const header = (
    <PageHeader
      eyebrow={t("storefront.title")}
      title={t("sfContent.title")}
      icon="home-edit-outline"
      onBack={onBack}
    />
  );
  const load = useCallback(() => client.getStorefrontContent(), [client]);
  const { state, reload } = useAsync<StorefrontContent>(load);

  if (!canManage) {
    return (
      <ScrollScreen>
        {header}
        <Notice
          tone="warning"
          title={t("sfContent.accessTitle")}
          message={t("sfContent.accessBody")}
        />
      </ScrollScreen>
    );
  }
  if (state.status === "loading") {
    return (
      <ScrollScreen>
        {header}
        <LoadingBlock label={t("sfContent.loading")} />
      </ScrollScreen>
    );
  }
  if (state.status === "error") {
    return (
      <ScrollScreen>
        {header}
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
  return (
    <ContentEditor
      header={header}
      initial={state.data}
      client={client}
      imagePicker={imagePicker}
      generateIdempotencyKey={generateIdempotencyKey}
      fetchImpl={fetchImpl}
    />
  );
}

function ContentEditor({
  header,
  initial,
  client,
  imagePicker,
  generateIdempotencyKey,
  fetchImpl,
}: {
  header: React.ReactNode;
  initial: StorefrontContent;
  client: StorefrontContentClient;
  imagePicker: ImagePicker;
  generateIdempotencyKey: IdempotencyKeyFactory;
  fetchImpl: typeof globalThis.fetch;
}) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<StorefrontContentForm>(() => contentToForm(initial));
  const [errors, setErrors] = useState<StorefrontContentErrors>({});
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const products = useCatalogProducts(client);
  const collections = useCatalogCollections(client);
  const mediaBase = getPublicMediaBaseUrl();

  const producer = useCallback(
    (request: ReturnType<typeof buildContentRequest>, idempotencyKey: string) =>
      client.updateStorefrontContent({ ...request, idempotencyKey }),
    [client],
  );
  const mutation = useMutation(producer, generateIdempotencyKey, {
    onSuccess: (saved) => {
      setForm(contentToForm(saved));
      toast.success(t("sfContent.savedToast"), { title: t("sfContent.savedTitle") });
      mutation.reset();
    },
    onError: (error) => {
      const described = describePromotionWriteError(error);
      toast.error(described.message, { title: described.heading });
    },
  });

  function update<K extends keyof StorefrontContentForm>(key: K, value: StorefrontContentForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function pickImage() {
    setUploadError(null);
    let image: PickedImage | null;
    try {
      image = await imagePicker();
    } catch {
      image = null;
    }
    if (!image) return;
    setUploading(true);
    try {
      const intent = await client.createStorefrontHeroImageIntent({
        contentType: image.contentType,
        ...(image.fileName ? { fileName: image.fileName.slice(0, 200) } : {}),
      });
      if (!intent.uploadUrl) throw new MediaStorageUnavailableError();
      const response = await fetchImpl(intent.uploadUrl, {
        method: "PUT",
        headers: { "content-type": intent.contentType },
        body: image.body,
      });
      if (!response.ok) throw new MediaUploadFailedError(response.status);
      update("image", { bucket: intent.bucket, path: intent.path });
      setPreview(image.previewUri ?? null);
      toast.success(t("sfContent.imageUploaded"));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("sfContent.imageFailed"));
    } finally {
      setUploading(false);
    }
  }

  function save() {
    const next = validateContentForm(form);
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      toast.error(t("common.fixHighlightedSave"));
      return;
    }
    mutation.submit(buildContentRequest(form));
  }

  const imageUri =
    preview ??
    (form.image && mediaBase ? `${mediaBase}/${form.image.bucket}/${form.image.path}` : null);
  const saving = mutation.state.status === "submitting";

  return (
    <ScrollScreen>
      {header}
      <Notice message={t("sfContent.intro")} />

      <FormSection title={t("sfContent.heroSection")} icon="image-area">
        <View style={styles.heroImage} testID="hero-image-preview">
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.heroImageFill}
              resizeMode="cover"
              accessibilityLabel={form.imageAlt || t("sfContent.heroImage")}
            />
          ) : (
            <Text style={styles.heroPlaceholder}>
              {form.image
                ? t("sfContent.imageSaved", { path: form.image.path })
                : t("sfContent.noImage")}
            </Text>
          )}
        </View>
        <View style={styles.imageActions}>
          <PrimaryButton
            label={
              uploading
                ? t("sfContent.uploading")
                : form.image
                  ? t("sfContent.replaceImage")
                  : t("sfContent.chooseImage")
            }
            icon="image-plus"
            variant="secondary"
            disabled={uploading || saving}
            testID="hero-image-pick"
            onPress={() => void pickImage()}
          />
          {form.image ? (
            <TextButton
              label={t("sfContent.removeImage")}
              testID="hero-image-remove"
              onPress={() => {
                update("image", null);
                setPreview(null);
              }}
            />
          ) : null}
        </View>
        <FieldError message={uploadError} testID="hero-image-error" />
        {form.image ? (
          <TextField
            label={t("sfContent.imageAlt")}
            value={form.imageAlt}
            onChangeText={(v) => update("imageAlt", v)}
            hint={t("sfContent.imageAltHint")}
            testID="hero-image-alt"
            error={errors.imageAlt}
          />
        ) : null}
        <TextField
          label={t("sfContent.eyebrow")}
          value={form.eyebrow}
          onChangeText={(v) => update("eyebrow", v)}
          placeholder={t("sfContent.eyebrowPlaceholder")}
          testID="hero-eyebrow"
          error={errors.eyebrow}
        />
        <TextField
          label={t("sfContent.headline")}
          value={form.title}
          onChangeText={(v) => update("title", v)}
          placeholder={t("sfContent.headlinePlaceholder")}
          testID="hero-title"
          error={errors.title}
        />
        <TextField
          label={t("sfContent.subtitle")}
          value={form.subtitle}
          onChangeText={(v) => update("subtitle", v)}
          multiline
          testID="hero-subtitle"
          error={errors.subtitle}
        />
        <TextField
          label={t("sfContent.ctaLabel")}
          value={form.ctaLabel}
          onChangeText={(v) => update("ctaLabel", v)}
          placeholder={t("sfContent.ctaLabelPlaceholder")}
          testID="hero-cta-label"
          error={errors.ctaLabel}
        />
        <TextField
          label={t("sfContent.ctaHref")}
          value={form.ctaHref}
          onChangeText={(v) => update("ctaHref", v)}
          placeholder="/catalog"
          hint={t("sfContent.ctaHrefHint")}
          testID="hero-cta-href"
          error={errors.ctaHref}
        />
      </FormSection>

      <FormSection title={t("sfContent.featuredSection")} icon="star-outline">
        <Body>{t("sfContent.featuredHelp")}</Body>
        <TextField
          label={t("sfContent.featuredHeading")}
          value={form.featuredHeading}
          onChangeText={(v) => update("featuredHeading", v)}
          placeholder={t("sfContent.featuredHeadingPlaceholder")}
          testID="featured-heading"
          error={errors.featuredHeading}
        />
        <AsyncBlock
          state={products.state}
          reload={products.reload}
          loadingLabel={t("merch.loadingProducts")}
        >
          {(items) => (
            <MultiPicker
              items={items}
              selected={form.featuredProductIds}
              onChange={(v) => update("featuredProductIds", v)}
              ordered
              max={MAX_FEATURED_PRODUCTS}
              describe={(item) => (item.status === "active" ? item.styleCode : item.status)}
              error={errors.featuredProductIds}
              testIDPrefix="featured-products"
            />
          )}
        </AsyncBlock>
      </FormSection>

      <FormSection title={t("sfContent.collectionsSection")} icon="shape-outline">
        <Body>{t("sfContent.collectionsHelp")}</Body>
        <AsyncBlock
          state={collections.state}
          reload={collections.reload}
          loadingLabel={t("merch.loadingCollections")}
        >
          {(items) =>
            items.length === 0 ? (
              <Notice message={t("merch.noCollections")} />
            ) : (
              <MultiPicker
                items={items}
                selected={form.featuredCollectionIds}
                onChange={(v) => update("featuredCollectionIds", v)}
                ordered
                max={MAX_FEATURED_COLLECTIONS}
                describe={(item) => (item.status === "active" ? null : item.status)}
                error={errors.featuredCollectionIds}
                testIDPrefix="featured-collections"
              />
            )
          }
        </AsyncBlock>
      </FormSection>

      <PrimaryButton
        label={saving ? t("common.saving") : t("sfContent.save")}
        icon="content-save-outline"
        disabled={saving || uploading}
        testID="storefront-content-save"
        onPress={save}
      />
    </ScrollScreen>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    heroImage: {
      height: 180,
      borderRadius: radius.md,
      overflow: "hidden",
      backgroundColor: colors.brandSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    heroImageFill: { width: "100%", height: "100%" },
    heroPlaceholder: {
      color: colors.inkMuted,
      ...typography.caption,
      padding: spacing.md,
      textAlign: "center",
    },
    imageActions: { flexDirection: "row", alignItems: "center", gap: spacing.md, flexWrap: "wrap" },
  });
  return { colors, styles };
});
