import type {
  MeContextResponse,
  TenantCommerceClient,
  VendorListResponse,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  createVendor,
  setVendorStatus,
  slugify,
  updateVendor,
  validateProductName,
  validateSlug,
  type VendorArgs,
} from "../catalog/operations";
import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { CatalogWriteError, useOnSuccess } from "../products/catalog-write-ui";
import { errorHeading, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import {
  Badge,
  Body,
  Divider,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  Surface,
  TextButton,
  TextField,
} from "../ui/components";
import { spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import { createThemedStyles } from "../ui/useTheme";

type Vendor = VendorListResponse["vendors"][number];

export interface BrandsScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

/**
 * The labels the store sells (SDK 0.50 vendors), e.g. Zara, Polo, H&M or a local label. Shoppers
 * browse the website by these brands. Admins create, rename and archive brands here; each product
 * picks its brand from its own product page. Every write is authorized server-side (catalog.author).
 */
export function BrandsScreen({
  tenantId,
  context,
  onBack,
  generateIdempotencyKey,
}: BrandsScreenProps) {
  const { t } = useI18n();
  if (!context.access.catalog.canRead) {
    return (
      <ScrollScreen>
        <PageHeader eyebrow={t("cat.eyebrow")} title={t("brand.title")} onBack={onBack} />
        <Notice tone="warning" title={t("cat.accessTitle")} message={t("cat.accessBody")} />
      </ScrollScreen>
    );
  }
  return (
    <BrandsContent
      tenantId={tenantId}
      onBack={onBack}
      generateKey={generateIdempotencyKey ?? secureIdempotencyKey}
    />
  );
}

function BrandsContent({
  tenantId,
  onBack,
  generateKey,
}: {
  tenantId: string;
  onBack: () => void;
  generateKey: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const load = useCallback(() => client.listVendors(), [client]);
  const { state, reload, refresh, refreshing } = useAsync<VendorListResponse>(load);
  const [editing, setEditing] = useState<string | null>(null);
  const vendors = state.status === "success" ? state.data.vendors : [];

  return (
    <ScrollScreen onRefresh={refresh} refreshing={refreshing}>
      <PageHeader
        eyebrow={t("cat.eyebrow")}
        title={t("brand.title")}
        icon="tag-multiple-outline"
        onBack={onBack}
      />
      <Surface style={styles.card}>
        <BrandForm client={client} generateKey={generateKey} onSaved={reload} />
      </Surface>

      <SectionHeading title={t("brand.listTitle")} />
      {state.status === "loading" ? <LoadingBlock label={t("brand.loading")} /> : null}
      {state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(state.error.kind)}
          message={state.error.message}
          action={
            isRetryable(state.error.kind) ? (
              <TextButton label={t("common.retry")} icon="refresh" onPress={reload} />
            ) : undefined
          }
        />
      ) : null}
      {state.status === "success" && vendors.length === 0 ? (
        <Notice message={t("brand.empty")} testID="brand-empty" />
      ) : null}
      {vendors.map((vendor) => (
        <Surface
          key={vendor.id}
          tone="muted"
          style={styles.row}
          testID={`brand-row-${vendor.slug}`}
        >
          <View style={styles.rowTop}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowName}>{vendor.name}</Text>
              <Text style={styles.rowMeta}>
                {t("cat.rowMeta", { slug: vendor.slug, count: vendor.productCount })}
              </Text>
            </View>
            {vendor.status === "archived" ? (
              <Badge label={t("cat.archived")} tone="warning" />
            ) : null}
          </View>
          {editing === vendor.id ? (
            <>
              <Divider />
              <BrandForm
                client={client}
                existing={vendor}
                generateKey={generateKey}
                onSaved={() => {
                  setEditing(null);
                  reload();
                }}
              />
              <Divider />
              <ArchiveToggle
                client={client}
                vendor={vendor}
                generateKey={generateKey}
                onSaved={() => {
                  setEditing(null);
                  reload();
                }}
              />
              <TextButton
                label={t("common.cancel")}
                icon="close"
                onPress={() => setEditing(null)}
              />
            </>
          ) : (
            <TextButton
              label={t("cat.edit")}
              icon="pencil-outline"
              testID={`brand-edit-${vendor.slug}`}
              onPress={() => setEditing(vendor.id)}
            />
          )}
        </Surface>
      ))}
    </ScrollScreen>
  );
}

/** Create (no `existing`) or edit a brand. The web address follows the name until edited by hand. */
function BrandForm({
  client,
  existing,
  generateKey,
  onSaved,
}: {
  client: TenantCommerceClient;
  existing?: Vendor;
  generateKey: IdempotencyKeyFactory;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const [name, setName] = useState(existing?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(existing));
  const [problem, setProblem] = useState<string | null>(null);
  const mutation = useMutation(
    (args: VendorArgs, key) =>
      existing
        ? updateVendor(client, { ...args, vendorId: existing.id }, key)
        : createVendor(client, args, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => {
    if (!existing) {
      setName("");
      setSlug("");
      setSlugEdited(false);
    }
    onSaved();
  });

  function onSubmit() {
    const issue = validateProductName(name) ?? validateSlug(slug);
    setProblem(issue);
    if (issue) return;
    mutation.submit({ name: name.trim(), slug: slug.trim() });
  }

  return (
    <View style={styles.form}>
      {existing ? null : <SectionHeading title={t("brand.newTitle")} detail={t("brand.newDesc")} />}
      <TextField
        label={t("cat.name")}
        value={name}
        onChangeText={(next) => {
          setName(next);
          if (!slugEdited) setSlug(slugify(next));
        }}
        placeholder={t("brand.namePlaceholder")}
        testID={existing ? `brand-name-${existing.slug}` : "brand-new-name"}
        required
      />
      <TextField
        label={t("cat.slug")}
        value={slug}
        onChangeText={(next) => {
          setSlug(next);
          setSlugEdited(true);
        }}
        hint={t("brand.slugHint")}
        autoCapitalize="none"
        testID={existing ? `brand-slug-${existing.slug}` : "brand-new-slug"}
        required
      />
      {problem ? <Notice tone="danger" message={problem} /> : null}
      {mutation.state.status === "error" ? (
        <CatalogWriteError state={mutation.state} mutation={mutation} onRefresh={onSaved} />
      ) : null}
      <PrimaryButton
        label={
          mutation.state.status === "submitting"
            ? t("po.saving")
            : existing
              ? t("common.saveChanges")
              : t("brand.create")
        }
        icon={existing ? "content-save-outline" : "plus"}
        testID={existing ? `brand-save-${existing.slug}` : "brand-new-submit"}
        disabled={mutation.state.status === "submitting"}
        onPress={onSubmit}
      />
    </View>
  );
}

function ArchiveToggle({
  client,
  vendor,
  generateKey,
  onSaved,
}: {
  client: TenantCommerceClient;
  vendor: Vendor;
  generateKey: IdempotencyKeyFactory;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const archived = vendor.status === "archived";
  const mutation = useMutation(
    (status: "active" | "archived", key) =>
      setVendorStatus(client, { vendorId: vendor.id, status }, key),
    generateKey,
  );
  useOnSuccess(mutation.state, () => onSaved());
  return (
    <View style={{ gap: spacing.sm }}>
      <Body>{archived ? t("brand.restoreHelp") : t("brand.archiveHelp")}</Body>
      {mutation.state.status === "error" ? (
        <CatalogWriteError state={mutation.state} mutation={mutation} onRefresh={onSaved} />
      ) : null}
      <PrimaryButton
        variant="secondary"
        label={archived ? t("brand.restore") : t("brand.archive")}
        icon={archived ? "restore" : "archive-outline"}
        testID={`brand-${archived ? "restore" : "archive"}-${vendor.slug}`}
        disabled={mutation.state.status === "submitting"}
        onPress={() => mutation.submit(archived ? "active" : "archived")}
      />
    </View>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    card: { gap: spacing.md },
    form: { gap: spacing.md },
    row: { gap: spacing.sm, shadowOpacity: 0, elevation: 0 },
    rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    rowCopy: { flex: 1, gap: 2 },
    rowName: { color: colors.ink, ...typography.cardTitle },
    rowMeta: { color: colors.inkMuted, ...typography.caption },
  });
  return { styles };
});
