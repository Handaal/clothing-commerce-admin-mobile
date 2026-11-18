import type { Sale, TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import {
  AsyncBlock,
  MultiPicker,
  useCatalogCollections,
  useCatalogProducts,
} from "../merchandising/pickers";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { describePromotionWriteError } from "../promotions/write-errors";
import {
  Badge,
  Body,
  ConfirmButton,
  FieldError,
  FormSection,
  InfoRow,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SelectField,
  TextButton,
  TextField,
  Toggle,
} from "../ui/components";
import { radius, spacing, typography } from "../ui/theme";
import { createThemedStyles } from "../ui/useTheme";
import { useToast } from "../ui/Toast";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import { saleLiveState, saleStateLabel, saleStateTone } from "./display";
import {
  buildCreateSaleRequest,
  buildUpdateSaleRequest,
  EMPTY_SALE_FORM,
  previewSalePrice,
  saleToForm,
  validateSaleForm,
  type SaleFormErrors,
  type SaleFormState,
} from "./form";

export type SaleClient = Pick<
  TenantCommerceClient,
  | "getSale"
  | "createSale"
  | "updateSale"
  | "setSaleStatus"
  | "deleteSale"
  | "listProducts"
  | "listCollections"
>;

const PREVIEW_PRICE_MINOR = 69_000;

/** Route-level loader: create renders the empty editor, edit loads the sale first. */
export function SaleFormScreen(props: {
  mode: "create" | "edit";
  saleId?: string;
  client: SaleClient;
  canManage: boolean;
  onDone: () => void;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  if (!props.canManage) {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("sales.title")}
          title={t("sales.readOnlyTitle")}
          icon="sale-outline"
          onBack={props.onBack}
        />
        <Notice message={t("sales.readOnly")} />
      </ScrollScreen>
    );
  }
  if (props.mode === "edit") return <EditSaleLoader {...props} saleId={props.saleId ?? ""} />;
  return <SaleEditor {...props} />;
}

function EditSaleLoader(props: Parameters<typeof SaleFormScreen>[0] & { saleId: string }) {
  const { t } = useI18n();
  const load = useCallback(() => props.client.getSale(props.saleId), [props.client, props.saleId]);
  const { state, reload } = useAsync<Sale>(load);
  if (state.status === "loading") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("sales.title")}
          title={t("sales.editTitle")}
          icon="pencil-outline"
          onBack={props.onBack}
        />
        <LoadingBlock label={t("sales.loading")} />
      </ScrollScreen>
    );
  }
  if (state.status === "error") {
    return (
      <ScrollScreen>
        <PageHeader
          eyebrow={t("sales.title")}
          title={t("sales.editTitle")}
          icon="pencil-outline"
          onBack={props.onBack}
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
  return <SaleEditor {...props} initial={state.data} />;
}

type Intent =
  { kind: "create"; form: SaleFormState } | { kind: "edit"; saleId: string; form: SaleFormState };

function SaleEditor({
  mode,
  client,
  initial,
  onDone,
  onBack,
  generateIdempotencyKey = secureIdempotencyKey,
}: Parameters<typeof SaleFormScreen>[0] & { initial?: Sale }) {
  const { styles } = useStyles();
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<SaleFormState>(() =>
    initial ? saleToForm(initial) : { ...EMPTY_SALE_FORM },
  );
  const [errors, setErrors] = useState<SaleFormErrors>({});
  const [current, setCurrent] = useState<Sale | undefined>(initial);
  const [busy, setBusy] = useState(false);
  const products = useCatalogProducts(client);
  const collections = useCatalogCollections(client);

  const producer = useCallback(
    (intent: Intent, idempotencyKey: string) =>
      intent.kind === "create"
        ? client.createSale({ ...buildCreateSaleRequest(intent.form), idempotencyKey })
        : client.updateSale({
            saleId: intent.saleId,
            ...buildUpdateSaleRequest(intent.form),
            idempotencyKey,
          }),
    [client],
  );
  const mutation = useMutation(producer, generateIdempotencyKey, {
    onSuccess: () => {
      toast.success(mode === "create" ? t("sales.createdToast") : t("sales.savedToast"));
      onDone();
    },
    onError: (error) => {
      const described = describePromotionWriteError(error);
      toast.error(described.message, { title: described.heading });
    },
  });

  function update<K extends keyof SaleFormState>(key: K, value: SaleFormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }

  function submit() {
    const next = validateSaleForm(form);
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      toast.error(t("common.fixHighlightedSave"));
      return;
    }
    mutation.submit(
      mode === "create"
        ? { kind: "create", form }
        : { kind: "edit", saleId: (initial as Sale).id, form },
    );
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("sales.actionFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const preview = previewSalePrice(form, PREVIEW_PRICE_MINOR);
  const percentBadge =
    preview !== null && preview < PREVIEW_PRICE_MINOR
      ? Math.round(((PREVIEW_PRICE_MINOR - preview) / PREVIEW_PRICE_MINOR) * 100)
      : null;
  const live = current ? saleLiveState(current) : null;

  return (
    <ScrollScreen>
      <PageHeader
        eyebrow={t("sales.title")}
        title={mode === "create" ? t("sales.createTitle") : t("sales.editTitle")}
        description={t("sales.formDesc")}
        icon={mode === "create" ? "sale-outline" : "pencil-outline"}
        onBack={onBack}
      />

      {current && live ? (
        <FormSection title={t("sales.statusSection")} icon="power">
          <View style={styles.statusRow}>
            <Badge label={saleStateLabel(live)} tone={saleStateTone(live)} />
            <PrimaryButton
              label={current.status === "active" ? t("sales.pause") : t("sales.resume")}
              icon={current.status === "active" ? "pause" : "play"}
              variant="secondary"
              disabled={busy}
              testID="sale-toggle-status"
              onPress={() =>
                void run(async () => {
                  const next = await client.setSaleStatus({
                    saleId: current.id,
                    status: current.status === "active" ? "inactive" : "active",
                    idempotencyKey: generateIdempotencyKey(),
                  });
                  setCurrent(next);
                }, t("sales.statusSaved"))
              }
            />
          </View>
        </FormSection>
      ) : null}

      <FormSection title={t("sales.sectionBasics")} icon="information-outline">
        <TextField
          label={t("sales.name")}
          value={form.name}
          onChangeText={(value) => update("name", value)}
          placeholder={t("sales.namePlaceholder")}
          testID="sale-name"
          required
          error={errors.name}
        />
        {mode === "create" ? (
          <Toggle
            value={form.active}
            onValueChange={(value) => update("active", value)}
            label={t("sales.startActive")}
            description={t("sales.startActiveDesc")}
            testID="sale-active"
          />
        ) : null}
      </FormSection>

      <FormSection title={t("sales.sectionDiscount")} icon="percent-outline">
        <SelectField
          label={t("sales.discountType")}
          options={[
            { value: "percentage", label: t("sales.typePercentage") },
            { value: "fixed_amount", label: t("sales.typeFixed") },
          ]}
          selected={form.benefitType}
          onSelect={(value) => {
            update("benefitType", value as SaleFormState["benefitType"]);
            update("value", "");
          }}
          testIDPrefix="sale-type"
        />
        <TextField
          label={
            form.benefitType === "percentage"
              ? t("sales.percentField")
              : t("sales.amountField", { currency: form.currency })
          }
          value={form.value}
          onChangeText={(value) => update("value", value)}
          placeholder={form.benefitType === "percentage" ? "34" : "100.00"}
          testID="sale-value"
          error={errors.value}
        />
        <View style={styles.preview} testID="sale-preview">
          <Text style={styles.previewLabel}>{t("sales.previewLabel")}</Text>
          <View style={styles.previewRow}>
            {percentBadge !== null ? (
              <Text style={styles.previewBadge}>{t("sales.badge", { percent: percentBadge })}</Text>
            ) : null}
            <Text style={styles.previewWas}>
              {formatMoneyMinor(PREVIEW_PRICE_MINOR, form.currency)}
            </Text>
            <Text style={styles.previewNow}>
              {preview !== null ? formatMoneyMinor(preview, form.currency) : "—"}
            </Text>
          </View>
        </View>
      </FormSection>

      <FormSection title={t("sales.sectionScope")} icon="target">
        <SelectField
          label={t("sales.appliesTo")}
          options={[
            { value: "all", label: t("sales.scopeAll") },
            { value: "collection", label: t("sales.scopeCollection") },
            { value: "products", label: t("sales.scopeProducts") },
          ]}
          selected={form.scope}
          onSelect={(value) => update("scope", value as SaleFormState["scope"])}
          testIDPrefix="sale-scope"
        />
        {form.scope === "all" ? <Body>{t("sales.scopeAllHelp")}</Body> : null}
        {form.scope === "collection" ? (
          <AsyncBlock
            state={collections.state}
            reload={collections.reload}
            loadingLabel={t("merch.loadingCollections")}
          >
            {(items) =>
              items.length === 0 ? (
                <Notice message={t("merch.noCollections")} />
              ) : (
                <SelectField
                  label={t("sales.collection")}
                  options={items.map((item) => ({
                    value: item.id,
                    label: item.status === "active" ? item.name : `${item.name} (${item.status})`,
                  }))}
                  selected={form.collectionId || null}
                  onSelect={(value) => update("collectionId", value)}
                  testIDPrefix="sale-collection"
                  error={errors.collectionId}
                />
              )
            }
          </AsyncBlock>
        ) : null}
        {form.scope === "products" ? (
          <AsyncBlock
            state={products.state}
            reload={products.reload}
            loadingLabel={t("merch.loadingProducts")}
          >
            {(items) => (
              <MultiPicker
                items={items}
                selected={form.productIds}
                onChange={(value) => update("productIds", value)}
                describe={(item) => item.styleCode}
                error={errors.productIds}
                testIDPrefix="sale-products"
              />
            )}
          </AsyncBlock>
        ) : null}
      </FormSection>

      <FormSection title={t("sales.sectionSchedule")} icon="calendar-clock-outline">
        <Body>{t("sales.scheduleHelp")}</Body>
        <TextField
          label={t("sales.startsAt")}
          value={form.startsAt}
          onChangeText={(value) => update("startsAt", value)}
          placeholder="2026-12-01 09:00"
          testID="sale-starts-at"
          error={errors.startsAt}
        />
        <TextField
          label={t("sales.endsAt")}
          value={form.endsAt}
          onChangeText={(value) => update("endsAt", value)}
          placeholder="2026-12-31 23:59"
          testID="sale-ends-at"
          error={errors.endsAt}
        />
      </FormSection>

      <FieldError
        message={
          mutation.state.status === "error"
            ? describePromotionWriteError(mutation.state.error).message
            : undefined
        }
      />
      <PrimaryButton
        label={
          mutation.state.status === "submitting"
            ? t("common.saving")
            : mode === "create"
              ? t("sales.createCta")
              : t("common.saveChanges")
        }
        icon={mode === "create" ? "sale-outline" : "content-save-outline"}
        disabled={mutation.state.status === "submitting" || busy}
        testID="sale-submit"
        onPress={submit}
      />

      {current ? (
        <FormSection title={t("sales.dangerSection")} icon="delete-outline">
          <InfoRow label={t("sales.deleteHelpLabel")} value={t("sales.deleteHelp")} />
          <ConfirmButton
            label={t("sales.delete")}
            confirmLabel={t("sales.deleteConfirm")}
            disabled={busy}
            testID="sale-delete"
            onConfirm={() =>
              void run(() => client.deleteSale(current.id), t("sales.deletedToast")).then((ok) => {
                if (ok) onDone();
              })
            }
          />
        </FormSection>
      ) : null}
    </ScrollScreen>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.md,
    },
    preview: {
      gap: 6,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.brandSoft,
    },
    previewLabel: { color: colors.inkMuted, ...typography.caption },
    previewRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
    previewBadge: {
      color: "#ffffff",
      backgroundColor: "#e5322d",
      fontWeight: "800",
      fontSize: 12,
      letterSpacing: 0.5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 4,
      overflow: "hidden",
    },
    previewWas: { color: colors.inkMuted, textDecorationLine: "line-through", ...typography.body },
    previewNow: { ...typography.body, color: colors.danger, fontWeight: "800" },
  });
  return { colors, styles };
});
