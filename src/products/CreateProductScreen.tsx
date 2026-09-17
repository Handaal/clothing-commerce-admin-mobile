import type { MeContextResponse } from "@shifted/clothing-commerce-sdk";
import { useMemo, useState } from "react";
import { View } from "react-native";

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
  Divider,
  Eyebrow,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  type SelectOption,
  TextButton,
  TextField,
  Title,
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
 * nothing it does not. A stable idempotency key (minted once per attempt, reused on ambiguous retry via
 * {@link useMutation}) means a retried create never makes a duplicate product.
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
        <PageHeader eyebrow="Catalog" title="New product" onBack={onBack} />
        <Divider />
        <Body>
          No brand is available to your account for this business, so a product cannot be created
          here. Ask an owner to grant brand access.
        </Body>
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

  // The slug auto-follows the name until the manager edits it directly.
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
    // Record what only the write revealed (publication state) plus the slug we chose, so the manage
    // screen can show them without a read contract that returns them.
    observationStore.record(created.productId, {
      status: created.status,
      storefrontStatus: created.storefrontStatus,
      slug: effectiveSlug.trim(),
    });
    return (
      <ScrollScreen>
        <PageHeader eyebrow="Catalog" title="Product created" onBack={onBack} />
        <Divider />
        <Body>
          “{name.trim()}” was created as a {created.status} product.
        </Body>
        <PrimaryButton
          testID="open-created-product"
          label="Manage this product"
          onPress={() => onCreated(created.productId)}
        />
        <TextButton label="Back to products" onPress={onBack} />
      </ScrollScreen>
    );
  }

  const described =
    mutation.state.status === "error" ? describeCatalogWriteError(mutation.state.error) : null;

  return (
    <ScrollScreen>
      <PageHeader eyebrow="Catalog" title="New product" onBack={onBack} />
      <Divider />
      {brandContext.kind === "single" ? (
        <Body>Brand: {brandContext.brand.name}</Body>
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
      <TextField
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        placeholder="Shown on the Storefront once published."
        testID="create-description"
        multiline
      />
      {localError ? <Body>{localError}</Body> : null}
      {described ? (
        <View style={{ gap: 8 }} testID="create-error">
          <Title>{described.heading}</Title>
          <Body>{described.message}</Body>
          {described.recovery === "retry" ? (
            <PrimaryButton label="Retry" testID="create-retry" onPress={() => mutation.retry()} />
          ) : null}
          {described.recovery === "edit" || described.recovery === "refresh" ? (
            <TextButton label="Dismiss" onPress={() => mutation.reset()} />
          ) : null}
          {described.recovery === "none" ? (
            <TextButton label="Dismiss" onPress={() => mutation.reset()} />
          ) : null}
        </View>
      ) : null}
      <Eyebrow>
        The product is created as a draft; you can add variants, prices and media next.
      </Eyebrow>
      <PrimaryButton
        label={mutation.state.status === "submitting" ? "Creating…" : "Create product"}
        testID="create-submit"
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </ScrollScreen>
  );
}
