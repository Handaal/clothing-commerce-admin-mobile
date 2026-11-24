import type {
  CatalogImage,
  CatalogImageInput,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { classifyCommerceError } from "../commerce/errors";
import { getPublicMediaBaseUrl } from "../config/env";
import { useI18n } from "../i18n";
import { FieldError, PrimaryButton, TextButton, TextField } from "../ui/components";
import { radius, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import {
  MediaStorageUnavailableError,
  MediaUploadFailedError,
  webImagePicker,
  type ImagePicker,
} from "./media";

export type CatalogImageClient = Pick<TenantCommerceClient, "createCatalogImageIntent">;

/**
 * SDK 0.53: a website image for a collection (cover) or category (tile). Picks an image, uploads it to
 * the server-chosen "<tenant>/catalog/" destination, then hands { bucket, path, altText } to `onSave`
 * (which calls setCollectionImage / setCategoryImage). "Remove" saves null — the website then falls back
 * to a product photo. The description (alt text) is saved with the image.
 */
export function CatalogImageField({
  client,
  label,
  hint,
  image,
  onSave,
  imagePicker = webImagePicker,
  fetchImpl = globalThis.fetch,
  testID,
}: {
  client: CatalogImageClient;
  label: string;
  hint: string;
  image: CatalogImage | null | undefined;
  onSave: (image: CatalogImageInput | null) => Promise<void>;
  imagePicker?: ImagePicker;
  fetchImpl?: typeof globalThis.fetch;
  testID: string;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState(image?.altText ?? "");
  const mediaBase = getPublicMediaBaseUrl();
  const uri = preview ?? (image && mediaBase ? `${mediaBase}/${image.bucket}/${image.path}` : null);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      if (caught instanceof MediaStorageUnavailableError) setError(t("pm.uploadUnavailable"));
      else if (caught instanceof MediaUploadFailedError) setError(t("pm.uploadFailed"));
      else setError(classifyCommerceError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  async function pick() {
    let picked;
    try {
      picked = await imagePicker();
    } catch {
      picked = null;
    }
    if (!picked) return;
    await run(async () => {
      const intent = await client.createCatalogImageIntent({
        contentType: picked.contentType,
        ...(picked.fileName ? { fileName: picked.fileName.slice(0, 200) } : {}),
      });
      if (!intent.uploadUrl) throw new MediaStorageUnavailableError();
      const response = await fetchImpl(intent.uploadUrl, {
        method: "PUT",
        headers: { "content-type": intent.contentType },
        body: picked.body,
      });
      if (!response.ok) throw new MediaUploadFailedError(response.status);
      await onSave({ bucket: intent.bucket, path: intent.path, altText: alt.trim() || null });
      setPreview(picked.previewUri ?? null);
    });
  }

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <View style={styles.frame}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.fill}
            resizeMode="cover"
            accessibilityLabel={label}
          />
        ) : (
          <Text style={styles.hint}>
            {image ? t("catImage.saved", { path: image.path }) : t("catImage.none")}
          </Text>
        )}
      </View>
      {image ? (
        <TextField
          label={t("pm.altText")}
          value={alt}
          onChangeText={setAlt}
          testID={`${testID}-alt`}
        />
      ) : null}
      <View style={styles.actions}>
        <PrimaryButton
          label={busy ? t("pm.uploading") : image ? t("catImage.replace") : t("catImage.choose")}
          icon="image-plus"
          variant="secondary"
          disabled={busy}
          testID={`${testID}-pick`}
          onPress={() => void pick()}
        />
        {image && alt.trim() !== (image.altText ?? "") ? (
          <TextButton
            label={t("pm.saveDescription")}
            icon="content-save-outline"
            testID={`${testID}-alt-save`}
            onPress={() =>
              void run(() =>
                onSave({ bucket: image.bucket, path: image.path, altText: alt.trim() || null }),
              )
            }
          />
        ) : null}
        {image ? (
          <TextButton
            label={t("catImage.remove")}
            icon="image-remove"
            testID={`${testID}-remove`}
            onPress={() =>
              void run(async () => {
                await onSave(null);
                setPreview(null);
              })
            }
          />
        ) : null}
      </View>
      <FieldError message={error} testID={`${testID}-error`} />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    wrap: { gap: spacing.sm },
    label: { ...typography.label, color: colors.ink },
    hint: { ...typography.caption, color: colors.inkMuted, textAlign: "center" },
    frame: {
      height: 150,
      borderRadius: radius.md,
      overflow: "hidden",
      backgroundColor: colors.surfaceMuted,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.sm,
    },
    fill: { width: "100%", height: "100%" },
    actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, alignItems: "center" },
  });
  return { colors, styles };
});
