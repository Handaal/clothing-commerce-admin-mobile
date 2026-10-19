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
  const generateKey = generateIdempotencyKey ?? secureIdempotencyKey;
  const brandContext = useMemo(
    () => resolveBrandContext(context.access.catalog),
    [context.access.catalog],
  );

  if (brandContext.kind === "none") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow="Catalog"
          title="New product"
          description="Create the product identity before adding variants, prices and media."
          icon="tag-plus-outline"
          onBack={onBack}
        />
        <Notice
          tone="warning"
          title="Brand access required"
          message="No brand is available to your account for this business, so a product cannot be created here. Ask an owner to grant brand access."
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
  const [localError, setLocalError] = useState<string | null>(null);

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
  );

  function onSubmit() {
    const trimmedName = name.trim();
    const trimmedSlug = effectiveSlug.trim();
    const problem = !brandId
      ? "Choose a brand for this product."
      : (validateProductName(trimmedName) ??
        validateSlug(trimmedSlug) ??
        validateStyleCode(styleCode));
    setLocalError(problem);
    if (problem || !brandId) return;
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
        <PageHeader eyebrow="Catalog" title="Product created" icon="check-circle-outline" />
        <EmptyState
          icon="check-circle-outline"
          title="Ready to configure"
          message={`“${name.trim()}” was created as a ${created.status} product. Add variants and a price before publishing it.`}
        />
        <Surface tone="accent">
          <PrimaryButton
            testID="open-created-product"
            label="Manage this product"
            icon="arrow-right"
            onPress={() => onCreated(created.productId)}
          />
          <TextButton label="Back to products" icon="arrow-left" onPress={onBack} />
        </Surface>
      </ScrollScreen>
    );
  }

  const described =
    mutation.state.status === "error" ? describeCatalogWriteError(mutation.state.error) : null;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow="Catalog"
        title="New product"
        description="Start with a clear product identity. Variants, pricing and imagery come next."
        icon="tag-plus-outline"
        onBack={onBack}
      />

      <FormSection
        title="Product identity"
        description="Internal catalog details shared across your management channels."
        icon="tag-outline"
      >
        {brandContext.kind === "single" ? (
          <Notice tone="info" message={`Brand: ${brandContext.brand.name}`} />
        ) : (
          <SelectField
            label="Brand"
            options={brandOptions}
            selected={brandId}
            onSelect={setBrandId}
            testIDPrefix="create-brand"
          />
        )}
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Summer Linen Shirt"
          testID="create-name"
          autoCapitalize="words"
        />
        <TextField
          label="Storefront slug"
          value={effectiveSlug}
          onChangeText={(next) => {
            setSlugTouched(true);
            setSlug(next);
          }}
          placeholder="summer-linen-shirt"
          testID="create-slug"
          autoCapitalize="none"
        />
        <TextField
          label="Style code (optional)"
          value={styleCode}
          onChangeText={setStyleCode}
          placeholder="e.g. LS-001"
          testID="create-style-code"
          autoCapitalize="characters"
        />
      </FormSection>

      <FormSection
        title="Storefront content"
        description="This description is used only when the product is later published."
        icon="text-box-outline"
      >
        <TextField
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the product, material and fit."
          testID="create-description"
          multiline
        />
      </FormSection>

      {localError ? <Notice tone="danger" message={localError} /> : null}
      {described ? (
        <Notice
          tone="danger"
          title={described.heading}
          message={described.message}
          testID="create-error"
          action={
            described.recovery === "retry" ? (
              <TextButton
                label="Retry"
                icon="refresh"
                testID="create-retry"
                onPress={() => mutation.retry()}
              />
            ) : (
              <TextButton label="Dismiss" icon="close" onPress={() => mutation.reset()} />
            )
          }
        />
      ) : null}

      <Surface tone="brand">
        <Body>The product starts as a draft. Nothing is published or sold automatically.</Body>
        <PrimaryButton
          label={mutation.state.status === "submitting" ? "Creating…" : "Create product"}
          icon="plus"
          testID="create-submit"
          disabled={mutation.state.status === "submitting"}
          onPress={onSubmit}
        />
      </Surface>
    </ScrollScreen>
  );
}
