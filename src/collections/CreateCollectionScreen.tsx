import type { CreateCollectionInput, MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useState } from "react";

import { slugify, validateProductName, validateSlug } from "../catalog/operations";
import { describeCatalogWriteError } from "../catalog/write-errors";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { useI18n } from "../i18n";
import { useSession } from "../session/SessionProvider";
import {
  Body,
  EmptyState,
  FormSection,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  Surface,
  TextButton,
  TextField,
} from "../ui/components";
import { useToast } from "../ui/Toast";
import { useMutation } from "../ui/useMutation";

export interface CreateCollectionScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onCreated: (collectionId: string) => void;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

/**
 * Create-collection flow against the real contract (`createCollection`). Captures the canonical fields —
 * name, slug (required), description (optional). A collection starts as a draft; the manage screen then
 * groups products and publishes it. A stable idempotency key is reused on an ambiguous retry.
 */
export function CreateCollectionScreen({
  tenantId,
  context,
  onCreated,
  onBack,
  generateIdempotencyKey,
}: CreateCollectionScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const generateKey = generateIdempotencyKey ?? secureIdempotencyKey;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; slug?: string }>({});
  const toast = useToast();

  if (!context.access.catalog.canRead) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("collections.eyebrow")}
          title={t("createCollection.title")}
          icon="shape-plus-outline"
          onBack={onBack}
        />
        <Notice tone="warning" title={t("collections.accessTitle")} message={t("collections.accessBody")} />
      </ScrollScreen>
    );
  }

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const mutation = useMutation(
    (args: { name: string; slug: string; description?: string }, key) =>
      client.createCollection({ ...args, idempotencyKey: key } satisfies CreateCollectionInput),
    generateKey,
    {
      onSuccess: () =>
        toast.success(t("createCollection.createdToast", { name: name.trim() }), {
          title: t("createCollection.createdTitle"),
        }),
      onError: (error) => {
        const described = describeCatalogWriteError(error);
        toast.error(described.message, { title: described.heading });
      },
    },
  );

  function onSubmit() {
    const trimmedName = name.trim();
    const trimmedSlug = effectiveSlug.trim();
    const errors = {
      name: validateProductName(trimmedName) ?? undefined,
      slug: validateSlug(trimmedSlug) ?? undefined,
    };
    setFieldErrors(errors);
    if (errors.name || errors.slug) {
      toast.error(t("common.fixHighlighted"));
      return;
    }
    mutation.submit({
      name: trimmedName,
      slug: trimmedSlug,
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  }

  if (mutation.state.status === "success") {
    const created = mutation.state.data;
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("collections.eyebrow")}
          title={t("createCollection.createdTitle")}
          icon="check-circle-outline"
        />
        <EmptyState
          icon="check-circle-outline"
          title={t("createCollection.createdTitle")}
          message={t("createCollection.createdToast", { name: name.trim() })}
        />
        <Surface tone="accent">
          <PrimaryButton
            testID="open-created-collection"
            label={t("createCollection.manageCta")}
            icon="arrow-right"
            onPress={() => onCreated(created.collectionId)}
          />
          <TextButton label={t("common.back")} icon="arrow-left" onPress={onBack} />
        </Surface>
      </ScrollScreen>
    );
  }

  const described =
    mutation.state.status === "error" ? describeCatalogWriteError(mutation.state.error) : null;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("collections.eyebrow")}
        title={t("createCollection.title")}
        description={t("createCollection.formDesc")}
        icon="shape-plus-outline"
        onBack={onBack}
      />

      <FormSection
        title={t("createCollection.identitySection")}
        description={t("createCollection.identityDesc")}
        icon="shape-outline"
      >
        <TextField
          label={t("createCollection.nameField")}
          value={name}
          onChangeText={(next) => {
            setName(next);
            if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder={t("createCollection.namePlaceholder")}
          testID="create-collection-name"
          autoCapitalize="words"
          required
          error={fieldErrors.name}
        />
        <TextField
          label={t("createCollection.slugField")}
          value={effectiveSlug}
          onChangeText={(next) => {
            setSlugTouched(true);
            setSlug(next);
            if (fieldErrors.slug) setFieldErrors((prev) => ({ ...prev, slug: undefined }));
          }}
          placeholder={t("createCollection.slugPlaceholder")}
          testID="create-collection-slug"
          autoCapitalize="none"
          required
          error={fieldErrors.slug}
          hint={t("createCollection.slugHint")}
        />
        <TextField
          label={t("createCollection.descField")}
          value={description}
          onChangeText={setDescription}
          placeholder={t("createCollection.descPlaceholder")}
          testID="create-collection-description"
          multiline
        />
      </FormSection>

      {described ? (
        <Notice
          tone="danger"
          title={described.heading}
          message={described.message}
          testID="create-collection-error"
          action={
            described.recovery === "retry" ? (
              <TextButton label={t("common.retry")} icon="refresh" onPress={() => mutation.retry()} />
            ) : (
              <TextButton label={t("common.dismiss")} icon="close" onPress={() => mutation.reset()} />
            )
          }
        />
      ) : null}

      <Surface tone="brand">
        <Body>{t("createCollection.identityDesc")}</Body>
        <PrimaryButton
          label={
            mutation.state.status === "submitting"
              ? t("createCollection.creating")
              : t("collections.createCta")
          }
          icon="plus"
          testID="create-collection-submit"
          disabled={mutation.state.status === "submitting"}
          onPress={onSubmit}
        />
      </Surface>
    </ScrollScreen>
  );
}
