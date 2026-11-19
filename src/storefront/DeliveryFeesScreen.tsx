import type {
  MeContextResponse,
  StorefrontDeliverySettings,
  TenantCommerceClient,
} from "@shifted/clothing-commerce-sdk";
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { formatMinorToInput, parseAmountToMinor } from "../catalog/money";
import { useI18n } from "../i18n";
import { secureIdempotencyKey, type IdempotencyKeyFactory } from "../inventory/idempotency";
import { errorHeading, formatMoneyMinor, isRetryable } from "../products/display";
import { useSession } from "../session/SessionProvider";
import { resolveSettingsAdapter } from "../settings/adapter";
import { settingsCapabilities } from "../settings/capabilities";
import type { CommerceSettings } from "../settings/model";
import {
  Body,
  Checkbox,
  LoadingBlock,
  Notice,
  PageHeader,
  PrimaryButton,
  ScrollScreen,
  SectionHeading,
  SelectField,
  Surface,
  TextButton,
  TextField,
} from "../ui/components";
import { radius, spacing, typography } from "../ui/theme";
import { useAsync } from "../ui/useAsync";
import { useMutation } from "../ui/useMutation";
import { createThemedStyles } from "../ui/useTheme";

/** Egypt's 27 governorates (ISO 3166-2:EG) — a one-tap starting list for the zone table. */
export const EGYPT_GOVERNORATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "EG-C", name: "Cairo" },
  { code: "EG-GZ", name: "Giza" },
  { code: "EG-ALX", name: "Alexandria" },
  { code: "EG-KB", name: "Qalyubia" },
  { code: "EG-BH", name: "Beheira" },
  { code: "EG-BNS", name: "Beni Suef" },
  { code: "EG-DK", name: "Dakahlia" },
  { code: "EG-DT", name: "Damietta" },
  { code: "EG-FYM", name: "Faiyum" },
  { code: "EG-GH", name: "Gharbia" },
  { code: "EG-IS", name: "Ismailia" },
  { code: "EG-KFS", name: "Kafr El Sheikh" },
  { code: "EG-MNF", name: "Monufia" },
  { code: "EG-MN", name: "Minya" },
  { code: "EG-PTS", name: "Port Said" },
  { code: "EG-SHR", name: "Sharqia" },
  { code: "EG-SUZ", name: "Suez" },
  { code: "EG-AST", name: "Asyut" },
  { code: "EG-SHG", name: "Sohag" },
  { code: "EG-KN", name: "Qena" },
  { code: "EG-LX", name: "Luxor" },
  { code: "EG-ASN", name: "Aswan" },
  { code: "EG-BA", name: "Red Sea" },
  { code: "EG-MT", name: "Matrouh" },
  { code: "EG-WAD", name: "New Valley" },
  { code: "EG-JS", name: "South Sinai" },
  { code: "EG-SIN", name: "North Sinai" },
];

interface ZoneRow {
  code: string;
  name: string;
  fee: string;
  active: boolean;
}

export interface DeliveryDraftState {
  threshold: string;
  zones: ZoneRow[];
}

export function draftFromSettings(settings: StorefrontDeliverySettings): DeliveryDraftState {
  return {
    threshold:
      settings.freeDeliveryThresholdMinor === null
        ? ""
        : formatMinorToInput(settings.freeDeliveryThresholdMinor),
    zones: settings.zones.map((zone) => ({
      code: zone.code,
      name: zone.name,
      fee: formatMinorToInput(zone.feeMinor),
      active: zone.active,
    })),
  };
}

/** Like parseAmountToMinor, but 0 is a valid fee/threshold (free delivery). */
function parseFeeMinor(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "" || /^0+(?:.0+)?$/.test(trimmed)) return 0;
  const parsed = parseAmountToMinor(trimmed);
  return parsed.ok ? parsed.amountMinor : null;
}

/** Turn the form into the API request, or report the first problem (translated by the caller). */
export function buildDeliveryRequest(draft: DeliveryDraftState):
  | {
      ok: true;
      value: {
        freeDeliveryThresholdMinor: number | null;
        zones: { code: string; name: string; feeMinor: number; active: boolean }[];
      };
    }
  | { ok: false; problem: "threshold" | "fee"; zone?: string } {
  let threshold: number | null = null;
  if (draft.threshold.trim() !== "") {
    threshold = parseFeeMinor(draft.threshold);
    if (threshold === null) return { ok: false, problem: "threshold" };
  }
  const zones = [];
  for (const zone of draft.zones) {
    const feeMinor = parseFeeMinor(zone.fee);
    if (feeMinor === null) return { ok: false, problem: "fee", zone: zone.name };
    zones.push({
      code: zone.code,
      name: zone.name,
      feeMinor,
      active: zone.active,
    });
  }
  return { ok: true, value: { freeDeliveryThresholdMinor: threshold, zones } };
}

export interface DeliveryFeesScreenProps {
  tenantId: string;
  context: MeContextResponse;
  onBack: () => void;
  generateIdempotencyKey?: IdempotencyKeyFactory;
}

/**
 * Website delivery fees (SDK 0.45): one fee per delivery area (Egypt's governorates) and an optional
 * free-delivery threshold, per Storefront brand. Saving replaces the whole list; checkout then requires
 * shoppers to pick one of the active areas and charges its fee. The API authorizes (settings.manage).
 */
export function DeliveryFeesScreen({
  tenantId,
  context,
  onBack,
  generateIdempotencyKey,
}: DeliveryFeesScreenProps) {
  const { t } = useI18n();
  const { getTenantClient } = useSession();
  const client = getTenantClient(tenantId);
  const capabilities = settingsCapabilities(context);
  const load = useCallback(() => resolveSettingsAdapter(client).getCommerce(), [client]);
  const { state, reload } = useAsync<CommerceSettings>(load);
  const [brandId, setBrandId] = useState<string | null>(null);

  const header = (
    <PageHeader
      eyebrow={t("storefront.eyebrow")}
      title={t("dlv.title")}
      description={t("dlv.desc")}
      icon="truck-delivery-outline"
      onBack={onBack}
    />
  );

  if (!capabilities.canRead) {
    return (
      <ScrollScreen>
        {header}
        <Notice tone="warning" message={t("dlv.noAccess")} />
      </ScrollScreen>
    );
  }
  if (state.status === "loading") {
    return (
      <ScrollScreen>
        {header}
        <LoadingBlock label={t("dlv.loading")} />
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

  const storefronts = state.data.storefronts;
  const selected = brandId ?? storefronts[0]?.brandId ?? null;
  return (
    <ScrollScreen>
      {header}
      {storefronts.length === 0 ? (
        <Notice tone="warning" message={t("dlv.noStorefront")} />
      ) : (
        <>
          {storefronts.length > 1 ? (
            <SelectField
              label={t("dlv.brand")}
              options={storefronts.map((s) => ({ value: s.brandId, label: s.brandName }))}
              selected={selected}
              onSelect={setBrandId}
              testIDPrefix="dlv-brand"
            />
          ) : null}
          {selected ? (
            <BrandDeliveryEditor
              key={selected}
              client={client}
              brandId={selected}
              canManage={capabilities.canManage}
              generateKey={generateIdempotencyKey ?? secureIdempotencyKey}
            />
          ) : null}
        </>
      )}
    </ScrollScreen>
  );
}

function BrandDeliveryEditor({
  client,
  brandId,
  canManage,
  generateKey,
}: {
  client: TenantCommerceClient;
  brandId: string;
  canManage: boolean;
  generateKey: IdempotencyKeyFactory;
}) {
  const { t } = useI18n();
  const load = useCallback(() => client.getStorefrontDeliverySettings(brandId), [client, brandId]);
  const { state, reload } = useAsync<StorefrontDeliverySettings>(load);

  if (state.status === "loading") return <LoadingBlock label={t("dlv.loading")} />;
  if (state.status === "error") {
    return (
      <Notice
        tone="danger"
        title={errorHeading(state.error.kind)}
        message={state.error.message}
        action={<TextButton label={t("common.tryAgain")} icon="refresh" onPress={reload} />}
      />
    );
  }
  return (
    <DeliveryForm
      key={JSON.stringify(state.data)}
      client={client}
      settings={state.data}
      canManage={canManage}
      generateKey={generateKey}
      onSaved={reload}
    />
  );
}

function DeliveryForm({
  client,
  settings,
  canManage,
  generateKey,
  onSaved,
}: {
  client: TenantCommerceClient;
  settings: StorefrontDeliverySettings;
  canManage: boolean;
  generateKey: IdempotencyKeyFactory;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const { styles } = useStyles();
  const [draft, setDraft] = useState<DeliveryDraftState>(() => draftFromSettings(settings));
  const [allFee, setAllFee] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const mutation = useMutation(
    (value: ReturnType<typeof buildDeliveryRequest> & { ok: true }, key) =>
      client.updateStorefrontDeliverySettings({
        brandId: settings.brandId,
        idempotencyKey: key,
        ...value.value,
      }),
    generateKey,
    { onSuccess: () => onSaved() },
  );
  const currency = settings.currency;
  const setZone = (index: number, patch: Partial<ZoneRow>) =>
    setDraft({
      ...draft,
      zones: draft.zones.map((z, i) => (i === index ? { ...z, ...patch } : z)),
    });

  function onSave() {
    const built = buildDeliveryRequest(draft);
    if (!built.ok) {
      setProblem(
        built.problem === "threshold"
          ? t("dlv.badThreshold")
          : t("dlv.badFee", { zone: built.zone ?? "" }),
      );
      return;
    }
    setProblem(null);
    mutation.submit(built);
  }

  const activeCount = draft.zones.filter((zone) => zone.active).length;

  return (
    <View style={styles.body}>
      <Surface style={styles.card}>
        <SectionHeading title={t("dlv.freeTitle")} detail={t("dlv.freeDesc")} />
        <TextField
          label={t("dlv.threshold", { currency })}
          value={draft.threshold}
          onChangeText={(threshold) => setDraft({ ...draft, threshold })}
          placeholder="2000"
          numeric
          hint={t("dlv.thresholdHint")}
          testID="dlv-threshold"
        />
      </Surface>

      <Surface style={styles.card}>
        <SectionHeading
          title={t("dlv.zonesTitle")}
          detail={t("dlv.zonesCount", { active: activeCount, total: draft.zones.length })}
        />
        {draft.zones.length === 0 ? (
          <>
            <Body>{t("dlv.emptyZones")}</Body>
            <PrimaryButton
              variant="secondary"
              label={t("dlv.addEgypt")}
              icon="map-marker-multiple-outline"
              testID="dlv-add-egypt"
              disabled={!canManage}
              onPress={() =>
                setDraft({
                  ...draft,
                  zones: EGYPT_GOVERNORATES.map((g) => ({ ...g, fee: "", active: true })),
                })
              }
            />
          </>
        ) : (
          <>
            <View style={styles.bulk}>
              <View style={styles.bulkField}>
                <TextField
                  label={t("dlv.allFee", { currency })}
                  value={allFee}
                  onChangeText={setAllFee}
                  placeholder="60"
                  numeric
                  testID="dlv-all-fee"
                />
              </View>
              <TextButton
                label={t("dlv.applyAll")}
                icon="format-paint"
                testID="dlv-apply-all"
                onPress={() =>
                  allFee.trim() !== "" &&
                  setDraft({
                    ...draft,
                    zones: draft.zones.map((z) => ({ ...z, fee: allFee.trim() })),
                  })
                }
              />
            </View>
            {draft.zones.map((zone, index) => (
              <View key={zone.code} style={styles.zone} testID={`dlv-zone-${zone.code}`}>
                <View style={styles.zoneHead}>
                  <Text style={styles.zoneName}>{zone.name}</Text>
                  <Text style={styles.zoneCode}>{zone.code}</Text>
                </View>
                <View style={styles.zoneRow}>
                  <View style={styles.zoneFee}>
                    <TextField
                      label={t("dlv.fee", { currency })}
                      value={zone.fee}
                      onChangeText={(fee) => setZone(index, { fee })}
                      placeholder="0"
                      numeric
                      testID={`dlv-fee-${zone.code}`}
                    />
                  </View>
                  <Checkbox
                    checked={zone.active}
                    onChange={(active) => setZone(index, { active })}
                    label={t("dlv.delivers")}
                    testID={`dlv-active-${zone.code}`}
                  />
                </View>
              </View>
            ))}
          </>
        )}
      </Surface>

      {settings.zones.length > 0 ? (
        <Body>
          {t("dlv.currentSummary", {
            count: settings.zones.filter((z) => z.active).length,
            from: formatMoneyMinor(
              Math.min(...settings.zones.map((z) => z.feeMinor)),
              settings.currency,
            ),
          })}
        </Body>
      ) : null}
      {problem ? <Notice tone="danger" message={problem} /> : null}
      {mutation.state.status === "success" ? (
        <Notice tone="success" message={t("dlv.saved")} testID="dlv-saved" />
      ) : null}
      {mutation.state.status === "error" ? (
        <Notice
          tone="danger"
          title={errorHeading(mutation.state.error.kind)}
          message={mutation.state.error.message}
          action={<TextButton label={t("common.dismiss")} icon="close" onPress={mutation.reset} />}
        />
      ) : null}
      {canManage ? (
        <PrimaryButton
          label={mutation.state.status === "submitting" ? t("dlv.saving") : t("dlv.save")}
          icon="content-save-outline"
          testID="dlv-save"
          disabled={mutation.state.status === "submitting"}
          onPress={onSave}
        />
      ) : (
        <Notice message={t("dlv.readOnly")} />
      )}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => {
  const styles = StyleSheet.create({
    body: { gap: spacing.lg },
    card: { gap: spacing.md },
    bulk: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
    bulkField: { flex: 1 },
    zone: {
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceMuted,
    },
    zoneHead: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
    zoneName: { flex: 1, color: colors.ink, ...typography.cardTitle },
    zoneCode: { color: colors.inkSubtle, ...typography.caption },
    zoneRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    zoneFee: { flex: 1 },
  });
  return { styles };
});
