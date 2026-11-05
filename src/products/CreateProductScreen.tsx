import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useMemo, useState } from "react";

import { resolveBrandContext } from "../catalog/brands";
import { catalogObservations, type CatalogObservationStore } from "../catalog/observations";
import {
  createProduct,
  slugify,
  validateProductName,
  validateSlug,
  validateStyleCode,
} from "../catalog/operations";
import { describeCatalogWriteError } from "../catalog/write-errors";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { useSession } from "../session/SessionProvider";
import {
  Body,
  EmptyState,
  FormSection,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  Surface,
  type SelectOption,
  TextButton,
  TextField,
} from "../ui/components";
import { useI18n } from "../i18n";
import { useToast } from "../ui/Toast";
import { useMutation } from "../ui/useMutation";

export interface CreateProductScreenProps {
  tenantId: string;
  context: MeContextResponse;
  /** Navigate to the new product's management screen. */
  onCreated: (productId: string) => void;
  onBack: () => void;
  /** Test seams. */
  generateIdempotencyKey?: IdempotencyKeyFactory;
  observationStore?: CatalogObservationStore;
}

/**
 * V1 create-product flow against the real contract (`createProduct`). Captures the canonical fields the
 * contract accepts — brand, name, slug (required), style code (optional), description (optional) — and
 * nothing it does not. A stable idempotency key is reused on an ambiguous retry.
 */
export function CreateProductScreen({
  tenantId,
  context,
  onCreated,
  onBack,
  generateIdempotencyKey,
  observationStore = catalogObservations,
}: CreateProductScreenProps) {
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const { t } = useI18n();
  const generateKey = generateIdempotencyKey ?? secureIdempotencyKey;
  const brandContext = useMemo(
    () => resolveBrandContext(context.access.catalog),
    [context.access.catalog],
  );

  if (brandContext.kind === "none") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("products.eyebrow")}
          title={t("createProduct.title")}
          description={t("createProduct.noBrandDesc")}
          icon="tag-plus-outline"
          onBack={onBack}
        />
        <Notice
          tone="warning"
          title={t("createProduct.brandAccessTitle")}
          message={t("createProduct.brandAccessMsg")}
        />
      </ScrollScreen>
    );
  }

  return (
    <CreateProductForm
      client={client}
      brandContext={brandContext}
      onCreated={onCreated}
      onBack={onBack}
      generateKey={generateKey}
      observationStore={observationStore}
    />
  );
}

function CreateProductForm({
  client,
  brandContext,
  onCreated,
  onBack,
  generateKey,
  observationStore,
}: {
  client: Parameters<typeof createProduct>[0];
  brandContext: Exclude<ReturnType<typeof resolveBrandContext>, { kind: "none" }>;
  onCreated: (productId: string) => void;
  onBack: () => void;
  generateKey: IdempotencyKeyFactory;
  observationStore: CatalogObservationStore;
}) {
  const [brandId, setBrandId] = useState<string | null>(
    brandContext.kind === "single" ? brandContext.brand.id : null,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [styleCode, setStyleCode] = useState("");
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    brand?: string;
    name?: string;
    slug?: string;
    styleCode?: string;
  }>({});
  const toast = useToast();
  const { t } = useI18n();

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const brandOptions = useMemo<SelectOption[]>(
    () =>
      brandContext.kind === "multi"
        ? brandContext.brands.map((brand) => ({ value: brand.id, label: brand.name }))
        : [],
    [brandContext],
  );

  const mutation = useMutation(
    (
      args: {
        brandId: string;
        name: string;
        slug: string;
        styleCode?: string;
        description?: string;
      },
      key,
    ) => createProduct(client, args, key),
    generateKey,
    {
      onSuccess: () =>
        toast.success(t("createProduct.createdToast", { name: name.trim() }), {
          title: t("createProduct.createdTitle"),
        }),
      onError: (error) => {
        const described = describeCatalogWriteError(error);
        toast.error(described.message, {
          title: described.heading,
          ...(described.recovery === "retry"
            ? { action: { label: t("common.retry"), icon: "refresh" as const, onPress: () => mutation.retry() } }
            : {}),
        });
      },
    },
  );

  function onSubmit() {
    const trimmedName = name.trim();
    const trimmedSlug = effectiveSlug.trim();
    const errors = {
      brand: brandId ? undefined : t("createProduct.chooseBrand"),
      name: validateProductName(trimmedName) ?? undefined,
      slug: validateSlug(trimmedSlug) ?? undefined,
      styleCode: validateStyleCode(styleCode) ?? undefined,
    };
    setFieldErrors(errors);
    if (!brandId || errors.name || errors.slug || errors.styleCode) {
      toast.error(t("common.fixHighlighted"));
      return;
    }
    mutation.submit({
      brandId,
      name: trimmedName,
      slug: trimmedSlug,
      ...(styleCode.trim() ? { styleCode: styleCode.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    });
  }

  if (mutation.state.status === "success") {
    const created = mutation.state.data;
    observationStore.record(created.productId, {
      status: created.status,
      storefrontStatus: created.storefrontStatus,
      slug: effectiveSlug.trim(),
    });
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("products.eyebrow")}
          title={t("createProduct.createdTitle")}
          icon="check-circle-outline"
        />
        <EmptyState
          icon="check-circle-outline"
          title={t("createProduct.readyTitle")}
          message={t("createProduct.readyMsg", {
            name: name.trim(),
            status: t(
              created.status === "draft"
                ? "filter.draft"
                : created.status === "active"
                  ? "filter.active"
                  : "filter.archived",
            ),
          })}
        />
        <Surface tone="accent">
          <PrimaryButton
            testID="open-created-product"
            label={t("createProduct.manageCta")}
            icon="arrow-right"
            onPress={() => onCreated(created.productId)}
          />
          <TextButton label={t("createProduct.backToProducts")} icon="arrow-left" onPress={onBack} />
        </Surface>
      </ScrollScreen>
    );
  }

  const described =
    mutation.state.status === "error" ? describeCatalogWriteError(mutation.state.error) : null;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("products.eyebrow")}
        title={t("createProduct.title")}
        description={t("createProduct.formDesc")}
        icon="tag-plus-outline"
        onBack={onBack}
      />

      <FormSection
        title={t("createProduct.identitySection")}
        description={t("createProduct.identityDesc")}
        icon="tag-outline"
      >
        {brandContext.kind === "single" ? (
          <Notice tone="info" message={t("createProduct.brandFixed", { name: brandContext.brand.name })} />
        ) : (
          <SelectField
            label={t("createProduct.brandLabel")}
            options={brandOptions}
            selected={brandId}
            onSelect={(value) => {
              setBrandId(value);
              setFieldErrors((prev) => ({ ...prev, brand: undefined }));
            }}
            testIDPrefix="create-brand"
            required
            error={fieldErrors.brand}
          />
        )}
        <TextField
          label={t("createProduct.nameField")}
          value={name}
          onChangeText={(next) => {
            setName(next);
            if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
          }}
          placeholder={t("createProduct.namePlaceholder")}
          testID="create-name"
          autoCapitalize="words"
          required
          error={fieldErrors.name}
        />
        <TextField
          label={t("createProduct.slugField")}
          value={effectiveSlug}
          onChangeText={(next) => {
            setSlugTouched(true);
            setSlug(next);
            if (fieldErrors.slug) setFieldErrors((prev) => ({ ...prev, slug: undefined }));
          }}
          placeholder={t("createProduct.slugPlaceholder")}
          testID="create-slug"
          autoCapitalize="none"
          required
          error={fieldErrors.slug}
          hint={t("createProduct.slugHint")}
        />
        <TextField
          label={t("createProduct.styleField")}
          value={styleCode}
          onChangeText={(next) => {
            setStyleCode(next);
            if (fieldErrors.styleCode) setFieldErrors((prev) => ({ ...prev, styleCode: undefined }));
          }}
          placeholder={t("createProduct.stylePlaceholder")}
          testID="create-style-code"
          autoCapitalize="characters"
          error={fieldErrors.styleCode}
        />
      </FormSection>

      <FormSection
        title={t("createProduct.contentSection")}
        description={t("createProduct.contentDesc")}
        icon="text-box-outline"
      >
        <TextField
          label={t("createProduct.descField")}
          value={description}
          onChangeText={setDescription}
          placeholder={t("createProduct.descPlaceholder")}
          testID="create-description"
          multiline
        />
      </FormSection>

      {described ? (
        <Notice
          tone="danger"
          title={described.heading}
          message={described.message}
          testID="create-error"
          action={
            described.recovery === "retry" ? (
              <TextButton
                label={t("common.retry")}
                icon="refresh"
                testID="create-retry"
                onPress={() => mutation.retry()}
              />
            ) : (
              <TextButton label={t("common.dismiss")} icon="close" onPress={() => mutation.reset()} />
            )
          }
        />
      ) : null}

      <Surface tone="brand">
        <Body>{t("createProduct.draftNote")}</Body>
        <PrimaryButton
          label={mutation.state.status === "submitting" ? t("createProduct.creating") : t("products.createCta")}
          icon="plus"
          testID="create-submit"
          disabled={mutation.state.status === "submitting"}
          onPress={onSubmit}
        />
      </Surface>
    </ScrollScreen>
  );
}
