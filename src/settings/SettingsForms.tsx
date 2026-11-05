import { useState } from "react";
import { View } from "react-native";

import { OPERATING_CURRENCY } from "../commerce/currency";
import { useI18n } from "../i18n";
import { tenantDisplayName } from "../tenant/presentation";
import {
  Body,
  InfoRow,
  NumberField,
  PrimaryButton,
  SelectField,
  TextField,
  Title,
} from "../ui/components";
import { describeSettingsError } from "./errors";
import type {
  BrandSettings,
  BrandSettingsDraft,
  BranchSettings,
  BranchSettingsDraft,
  BusinessSettings,
  BusinessSettingsDraft,
  CapabilityFlags,
  CommerceSettings,
  InventoryLocationSettingsDraft,
  ReceiptSettings,
  RegisterSettings,
  RegisterSettingsDraft,
  SettingsOption,
  WarehouseSettingsDraft,
} from "./model";
import { SettingsSection } from "./SettingsCommon";

type SaveState = { status: "idle" | "saving" } | { status: "error"; error: unknown };

export function BusinessForm({
  value,
  onSave,
}: {
  value: BusinessSettings;
  onSave: (draft: BusinessSettingsDraft) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<BusinessSettingsDraft>(() => ({
    displayName: tenantDisplayName(value.displayName),
    legalName: value.legalName,
    contactEmail: value.contactEmail,
    contactPhone: value.contactPhone,
    timezone: value.timezone,
    country: value.country,
    taxIdentifier: value.taxIdentifier,
    // Currency is locked to the single operating currency; the field below is read-only.
    defaultCurrency: OPERATING_CURRENCY,
  }));
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const valid = draft.displayName.trim() && draft.timezone.trim();
  return (
    <View style={{ gap: 12 }}>
      <InfoRow label={t("set.tenantIdentifier")} value={value.id} />
      <InfoRow label={t("set.tenantSlugRO")} value={value.slug} />
      <TextField
        label={t("set.displayName")}
        value={draft.displayName}
        onChangeText={(v) => setDraft({ ...draft, displayName: v })}
        testID="business-display-name"
      />
      <TextField
        label={t("set.legalName")}
        value={draft.legalName}
        onChangeText={(v) => setDraft({ ...draft, legalName: v })}
        testID="business-legal-name"
      />
      <TextField
        label={t("set.contactEmail")}
        value={draft.contactEmail}
        onChangeText={(v) => setDraft({ ...draft, contactEmail: v })}
        testID="business-email"
        autoCapitalize="none"
      />
      <TextField
        label={t("set.contactPhone")}
        value={draft.contactPhone}
        onChangeText={(v) => setDraft({ ...draft, contactPhone: v })}
        testID="business-phone"
      />
      <TextField
        label={t("set.timezone")}
        value={draft.timezone}
        onChangeText={(v) => setDraft({ ...draft, timezone: v })}
        testID="business-timezone"
      />
      <TextField
        label={t("set.country")}
        value={draft.country}
        onChangeText={(v) => setDraft({ ...draft, country: v })}
        testID="business-country"
      />
      <TextField
        label={t("set.taxIdentifier")}
        value={draft.taxIdentifier}
        onChangeText={(v) => setDraft({ ...draft, taxIdentifier: v })}
        testID="business-tax-id"
      />
      <InfoRow
        label={t("set.defaultCurrency")}
        value={draft.defaultCurrency}
        testID="business-currency"
      />
      <Body testID="business-currency-warning">{t("set.currencyWarning")}</Body>
      <SaveFeedback state={save} />
      <PrimaryButton
        label={save.status === "saving" ? t("set.saving") : t("set.saveBusiness")}
        testID="save-business"
        disabled={!valid || save.status === "saving"}
        onPress={() => void runSave(onSave(draft), setSave)}
      />
    </View>
  );
}

export function BrandForm({
  mode,
  initial,
  onSave,
}: {
  mode: "create" | "edit";
  initial?: BrandSettings;
  onSave: (draft: BrandSettingsDraft) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<BrandSettingsDraft>(() => ({
    code: initial?.code ?? "",
    displayName: initial?.displayName ?? "",
    legalName: initial?.legalName ?? "",
    status: initial?.status ?? "active",
  }));
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  return (
    <View style={{ gap: 12 }}>
      {mode === "create" ? (
        <TextField
          label={t("set.code")}
          value={draft.code}
          onChangeText={(v) => setDraft({ ...draft, code: v.toUpperCase() })}
          testID="brand-code"
          autoCapitalize="characters"
        />
      ) : (
        <InfoRow label={t("set.brandCodeRO")} value={draft.code} />
      )}
      <TextField
        label={t("set.displayName")}
        value={draft.displayName}
        onChangeText={(v) => setDraft({ ...draft, displayName: v })}
        testID="brand-display-name"
      />
      <TextField
        label={t("set.legalName")}
        value={draft.legalName}
        onChangeText={(v) => setDraft({ ...draft, legalName: v })}
        testID="brand-legal-name"
      />
      <SelectField
        label={t("set.status")}
        options={[
          { value: "active", label: t("set.active") },
          { value: "inactive", label: t("set.inactive") },
        ]}
        selected={draft.status}
        onSelect={(v) => setDraft({ ...draft, status: v as BrandSettingsDraft["status"] })}
        testIDPrefix="brand-status"
      />
      <SaveFeedback state={save} />
      <PrimaryButton
        label={
          save.status === "saving" ? t("set.saving") : mode === "create" ? t("set.createBrand") : t("set.saveBrand")
        }
        testID="save-brand"
        disabled={!draft.code.trim() || !draft.displayName.trim() || save.status === "saving"}
        onPress={() => void runSave(onSave(draft), setSave)}
      />
    </View>
  );
}

export function BranchForm({
  mode,
  initial,
  locationOptions,
  brandOptions = [],
  onSave,
}: {
  mode: "create" | "edit";
  initial?: BranchSettings;
  locationOptions: SettingsOption[];
  brandOptions?: SettingsOption[];
  onSave: (draft: BranchSettingsDraft) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<BranchSettingsDraft>(() => ({
    code: initial?.code ?? "",
    displayName: initial?.displayName ?? "",
    timezone: initial?.timezone ?? "",
    address: initial?.address ?? "",
    addressLine1: initial?.addressLine1 ?? "",
    addressLine2: initial?.addressLine2 ?? "",
    city: initial?.city ?? "",
    region: initial?.region ?? "",
    postalCode: initial?.postalCode ?? "",
    countryCode: initial?.countryCode ?? "",
    contactEmail: initial?.contactEmail ?? "",
    contactPhone: initial?.contactPhone ?? "",
    fulfillmentEnabled: initial?.fulfillmentEnabled ?? false,
    clickAndCollectEnabled: initial?.clickAndCollectEnabled ?? false,
    defaultInventoryLocationId: initial?.defaultInventoryLocationId ?? null,
    receiptFooter: initial?.receiptFooter ?? "",
    eligibleBrandIds: initial?.eligibleBrandIds,
    status: initial?.status ?? "active",
  }));
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const eligibleLocations = locationOptions.filter(
    (option) => initial && option.parentKind === "branch" && option.parentId === initial.id,
  );
  return (
    <View style={{ gap: 12 }}>
      {mode === "create" ? (
        <TextField
          label={t("set.code")}
          value={draft.code}
          onChangeText={(v) => setDraft({ ...draft, code: v.toUpperCase() })}
          testID="branch-code"
        />
      ) : (
        <InfoRow label={t("set.branchCodeRO")} value={draft.code} />
      )}
      <TextField
        label={t("set.displayName")}
        value={draft.displayName}
        onChangeText={(v) => setDraft({ ...draft, displayName: v })}
        testID="branch-display-name"
      />
      <TextField
        label={t("set.timezone")}
        value={draft.timezone}
        onChangeText={(v) => setDraft({ ...draft, timezone: v })}
        testID="branch-timezone"
      />
      <TextField
        label={t("set.addressLine1")}
        value={draft.addressLine1}
        onChangeText={(v) => setDraft({ ...draft, addressLine1: v, address: v })}
        testID="branch-address"
      />
      <TextField
        label={t("set.addressLine2")}
        value={draft.addressLine2}
        onChangeText={(v) => setDraft({ ...draft, addressLine2: v })}
        testID="branch-address-2"
      />
      <TextField
        label={t("set.city")}
        value={draft.city}
        onChangeText={(v) => setDraft({ ...draft, city: v })}
        testID="branch-city"
      />
      <TextField
        label={t("set.region")}
        value={draft.region}
        onChangeText={(v) => setDraft({ ...draft, region: v })}
        testID="branch-region"
      />
      <TextField
        label={t("set.postalCode")}
        value={draft.postalCode}
        onChangeText={(v) => setDraft({ ...draft, postalCode: v })}
        testID="branch-postal-code"
      />
      <TextField
        label={t("set.countryCode")}
        value={draft.countryCode}
        onChangeText={(v) => setDraft({ ...draft, countryCode: v.toUpperCase() })}
        testID="branch-country-code"
      />
      <TextField
        label={t("set.contactEmail")}
        value={draft.contactEmail}
        onChangeText={(v) => setDraft({ ...draft, contactEmail: v })}
        testID="branch-email"
        autoCapitalize="none"
      />
      <TextField
        label={t("set.contactPhone")}
        value={draft.contactPhone}
        onChangeText={(v) => setDraft({ ...draft, contactPhone: v })}
        testID="branch-phone"
      />
      <BooleanField
        label={t("set.fulfillment")}
        value={draft.fulfillmentEnabled}
        onChange={(v) => setDraft({ ...draft, fulfillmentEnabled: v })}
        testID="branch-fulfillment"
      />
      <BooleanField
        label={t("set.clickCollect")}
        value={draft.clickAndCollectEnabled}
        onChange={(v) => setDraft({ ...draft, clickAndCollectEnabled: v })}
        testID="branch-collect"
      />
      <SelectField
        label={t("set.defaultInvLocation")}
        options={[
          { value: "", label: t("set.none") },
          ...eligibleLocations.map((o) => ({ value: o.id, label: o.label })),
        ]}
        selected={draft.defaultInventoryLocationId ?? ""}
        onSelect={(v) => setDraft({ ...draft, defaultInventoryLocationId: v || null })}
        testIDPrefix="branch-location"
      />
      <TextField
        label={t("set.receiptFooter")}
        value={draft.receiptFooter}
        onChangeText={(v) => setDraft({ ...draft, receiptFooter: v })}
        testID="branch-receipt-footer"
        multiline
      />
      {brandOptions.length ? (
        <SettingsSection title={t("set.eligibleBrands")}>
          {brandOptions.map((brand) => {
            const selected = draft.eligibleBrandIds?.includes(brand.id) ?? false;
            return (
              <BooleanField
                key={brand.id}
                label={brand.label}
                value={selected}
                onChange={(enabled) =>
                  setDraft({
                    ...draft,
                    eligibleBrandIds: enabled
                      ? [...(draft.eligibleBrandIds ?? []), brand.id]
                      : (draft.eligibleBrandIds ?? []).filter((id) => id !== brand.id),
                  })
                }
                testID={`branch-brand-${brand.id}`}
              />
            );
          })}
        </SettingsSection>
      ) : null}
      <SaveFeedback state={save} />
      <PrimaryButton
        label={mode === "create" ? t("set.createBranch") : t("set.saveBranch")}
        testID="save-branch"
        disabled={
          !draft.code.trim() ||
          !draft.displayName.trim() ||
          !draft.timezone.trim() ||
          save.status === "saving"
        }
        onPress={() => void runSave(onSave(draft), setSave)}
      />
    </View>
  );
}

export function RegisterForm({
  mode,
  initial,
  branchOptions,
  locationOptions,
  onSave,
}: {
  mode: "create" | "edit";
  initial?: RegisterSettings;
  branchOptions: SettingsOption[];
  locationOptions: SettingsOption[];
  onSave: (draft: RegisterSettingsDraft) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<RegisterSettingsDraft>(() => ({
    code: initial?.code ?? "",
    displayName: initial?.displayName ?? "",
    branchId: initial?.branchId ?? "",
    defaultInventoryLocationId: initial?.defaultInventoryLocationId ?? null,
    // Selling currency is locked to the single operating currency; the field below is read-only.
    sellingCurrency: OPERATING_CURRENCY,
    status: initial?.status ?? "active",
  }));
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const eligibleLocations = locationOptions.filter(
    (option) =>
      !draft.branchId || (option.parentKind === "branch" && option.parentId === draft.branchId),
  );
  return (
    <View style={{ gap: 12 }}>
      {mode === "create" ? (
        <TextField
          label={t("set.code")}
          value={draft.code}
          onChangeText={(v) => setDraft({ ...draft, code: v.toUpperCase() })}
          testID="register-code"
        />
      ) : (
        <InfoRow label={t("set.registerCodeRO")} value={draft.code} />
      )}
      <TextField
        label={t("set.displayName")}
        value={draft.displayName}
        onChangeText={(v) => setDraft({ ...draft, displayName: v })}
        testID="register-display-name"
      />
      {mode === "create" ? (
        <SelectField
          label={t("set.branch")}
          options={branchOptions.map((o) => ({ value: o.id, label: o.label }))}
          selected={draft.branchId}
          onSelect={(v) => setDraft({ ...draft, branchId: v })}
          testIDPrefix="register-branch"
        />
      ) : (
        <InfoRow label={t("set.branchRO")} value={initial?.branchName ?? draft.branchId} />
      )}
      <SelectField
        label={t("set.defaultInvLocation")}
        options={[
          { value: "", label: t("set.none") },
          ...eligibleLocations.map((o) => ({ value: o.id, label: o.label })),
        ]}
        selected={draft.defaultInventoryLocationId ?? ""}
        onSelect={(v) => setDraft({ ...draft, defaultInventoryLocationId: v || null })}
        testIDPrefix="register-location"
      />
      <InfoRow
        label={t("set.sellingCurrency")}
        value={draft.sellingCurrency}
        testID="register-currency"
      />
      <Body>{t("set.registerCurrencyNote")}</Body>
      <SaveFeedback state={save} />
      <PrimaryButton
        label={mode === "create" ? t("set.createRegister") : t("set.saveRegister")}
        testID="save-register"
        disabled={
          !draft.code.trim() ||
          !draft.displayName.trim() ||
          !draft.branchId ||
          save.status === "saving"
        }
        onPress={() => void runSave(onSave(draft), setSave)}
      />
    </View>
  );
}

const emptyCapabilities: CapabilityFlags = {
  sellable: false,
  receiving: false,
  transferOrigin: false,
  transferDestination: false,
  fulfillment: false,
};

export function WarehouseCreateForm({
  onSave,
}: {
  onSave: (draft: WarehouseSettingsDraft) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<WarehouseSettingsDraft>({
    code: "",
    displayName: "",
    timezone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
    postalCode: "",
    countryCode: "",
    contactEmail: "",
    contactPhone: "",
    capabilities: { ...emptyCapabilities, sellable: undefined },
  });
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  return (
    <View style={{ gap: 12 }}>
      <TextField
        label={t("set.code")}
        value={draft.code}
        onChangeText={(code) => setDraft({ ...draft, code: code.toUpperCase() })}
        testID="warehouse-code"
      />
      <TextField
        label={t("set.displayName")}
        value={draft.displayName}
        onChangeText={(displayName) => setDraft({ ...draft, displayName })}
        testID="warehouse-display-name"
      />
      <TextField
        label={t("set.timezone")}
        value={draft.timezone}
        onChangeText={(timezone) => setDraft({ ...draft, timezone })}
        testID="warehouse-timezone"
      />
      <TextField
        label={t("set.addressLine1")}
        value={draft.addressLine1}
        onChangeText={(addressLine1) => setDraft({ ...draft, addressLine1 })}
        testID="warehouse-address"
      />
      <TextField
        label={t("set.addressLine2")}
        value={draft.addressLine2}
        onChangeText={(addressLine2) => setDraft({ ...draft, addressLine2 })}
      />
      <TextField
        label={t("set.city")}
        value={draft.city}
        onChangeText={(city) => setDraft({ ...draft, city })}
      />
      <TextField
        label={t("set.region")}
        value={draft.region}
        onChangeText={(region) => setDraft({ ...draft, region })}
      />
      <TextField
        label={t("set.postalCode")}
        value={draft.postalCode}
        onChangeText={(postalCode) => setDraft({ ...draft, postalCode })}
      />
      <TextField
        label={t("set.countryCode")}
        value={draft.countryCode}
        onChangeText={(countryCode) =>
          setDraft({ ...draft, countryCode: countryCode.toUpperCase() })
        }
      />
      <TextField
        label={t("set.contactEmail")}
        value={draft.contactEmail}
        onChangeText={(contactEmail) => setDraft({ ...draft, contactEmail })}
        autoCapitalize="none"
      />
      <TextField
        label={t("set.contactPhone")}
        value={draft.contactPhone}
        onChangeText={(contactPhone) => setDraft({ ...draft, contactPhone })}
      />
      <CapabilityFields
        value={draft.capabilities}
        onChange={(capabilities) => setDraft({ ...draft, capabilities })}
        includeSellable={false}
      />
      <SaveFeedback state={save} />
      <PrimaryButton
        label={save.status === "saving" ? t("set.creating") : t("set.createWarehouse")}
        testID="save-warehouse"
        disabled={
          !draft.code.trim() ||
          !draft.displayName.trim() ||
          !draft.timezone.trim() ||
          save.status === "saving"
        }
        onPress={() => void runSave(onSave(draft), setSave)}
      />
    </View>
  );
}

export function InventoryLocationCreateForm({
  branchOptions,
  warehouseOptions,
  onSave,
}: {
  branchOptions: SettingsOption[];
  warehouseOptions: SettingsOption[];
  onSave: (draft: InventoryLocationSettingsDraft) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<InventoryLocationSettingsDraft>({
    code: "",
    displayName: "",
    parentId: "",
    parentKind: "branch",
    locationType: "stockroom",
    capabilities: { ...emptyCapabilities },
  });
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const parent = draft.parentId ? `${draft.parentKind}:${draft.parentId}` : "";
  return (
    <View style={{ gap: 12 }}>
      <TextField
        label={t("set.code")}
        value={draft.code}
        onChangeText={(code) => setDraft({ ...draft, code: code.toUpperCase() })}
        testID="location-code"
      />
      <TextField
        label={t("set.displayName")}
        value={draft.displayName}
        onChangeText={(displayName) => setDraft({ ...draft, displayName })}
        testID="location-display-name"
      />
      <SelectField
        label={t("set.parentBranchOrWarehouse")}
        options={[
          ...branchOptions.map((item) => ({
            value: `branch:${item.id}`,
            label: t("set.branchDot", { label: item.label }),
          })),
          ...warehouseOptions.map((item) => ({
            value: `warehouse:${item.id}`,
            label: t("set.warehouseDot", { label: item.label }),
          })),
        ]}
        selected={parent}
        onSelect={(value) => {
          const [parentKind, parentId] = value.split(":", 2) as ["branch" | "warehouse", string];
          setDraft({ ...draft, parentKind, parentId });
        }}
        testIDPrefix="location-parent"
      />
      <TextField
        label={t("set.locationType")}
        value={draft.locationType}
        onChangeText={(locationType) => setDraft({ ...draft, locationType })}
        testID="location-type"
      />
      <CapabilityFields
        value={draft.capabilities}
        onChange={(capabilities) => setDraft({ ...draft, capabilities })}
        includeSellable
      />
      <SaveFeedback state={save} />
      <PrimaryButton
        label={save.status === "saving" ? t("set.creating") : t("set.createInvLocation")}
        testID="save-location"
        disabled={
          !draft.code.trim() ||
          !draft.displayName.trim() ||
          !draft.parentId ||
          !draft.locationType.trim() ||
          save.status === "saving"
        }
        onPress={() => void runSave(onSave(draft), setSave)}
      />
    </View>
  );
}

function CapabilityFields({
  value,
  onChange,
  includeSellable,
}: {
  value: CapabilityFlags;
  onChange: (value: CapabilityFlags) => void;
  includeSellable: boolean;
}) {
  const { t } = useI18n();
  const fields: Array<[keyof CapabilityFlags, string]> = [
    ...(includeSellable
      ? [["sellable" as keyof CapabilityFlags, t("set.capSellable")] as [keyof CapabilityFlags, string]]
      : []),
    ["fulfillment", t("set.fulfillment")],
    ["receiving", t("set.capReceiving")],
    ["transferOrigin", t("set.capTransferOrigin")],
    ["transferDestination", t("set.capTransferDestination")],
  ];
  return (
    <SettingsSection title={t("set.capabilityFlags")}>
      {fields.map(([key, label]) => (
        <BooleanField
          key={key}
          label={label}
          value={value[key] === true}
          onChange={(enabled) => onChange({ ...value, [key]: enabled })}
          testID={`capability-${key}`}
        />
      ))}
    </SettingsSection>
  );
}

export function CommerceForm({
  value,
  brandOptions = [],
  locationOptions = [],
  onSave,
}: {
  value: CommerceSettings;
  brandOptions?: SettingsOption[];
  locationOptions?: SettingsOption[];
  onSave: (value: CommerceSettings) => Promise<unknown>;
}) {
  const { t } = useI18n();
  // Storefront currency is locked to the single operating currency; the field below is read-only.
  const [draft, setDraft] = useState<CommerceSettings>(() => ({
    ...value,
    storefront: { ...value.storefront, currency: OPERATING_CURRENCY },
  }));
  const [windowDays, setWindowDays] = useState(
    value.returns.windowDays === null ? "" : String(value.returns.windowDays),
  );
  const [maxRefund, setMaxRefund] = useState(
    value.returns.maxManualRefundMinor === null ? "" : String(value.returns.maxManualRefundMinor),
  );
  const [allowedReasons, setAllowedReasons] = useState(
    (value.returns.allowedReasons ?? []).join(", "),
  );
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const submitted: CommerceSettings = {
    ...draft,
    returns: {
      ...draft.returns,
      windowDays: windowDays === "" ? null : Number(windowDays),
      maxManualRefundMinor: maxRefund ? Number(maxRefund) : null,
      allowedReasons: allowedReasons
        .split(",")
        .map((reason) => reason.trim())
        .filter(Boolean),
    },
  };
  return (
    <View style={{ gap: 12 }}>
      <SettingsSection title={t("set.storefront")}>
        <SelectField
          label={t("set.brandContext")}
          options={brandOptions.map((option) => ({ value: option.id, label: option.label }))}
          selected={draft.storefront.brandId}
          onSelect={(brandId) => {
            const existing = draft.storefronts.find((item) => item.brandId === brandId);
            const brandName = brandOptions.find((item) => item.id === brandId)?.label ?? brandId;
            setDraft({
              ...draft,
              storefront: existing ?? { ...draft.storefront, brandId, brandName },
            });
          }}
          testIDPrefix="storefront-brand"
        />
        <SelectField
          label={t("set.fulfillmentInvLocation")}
          options={locationOptions.map((option) => ({ value: option.id, label: option.label }))}
          selected={draft.storefront.fulfillmentInventoryLocationId}
          onSelect={(fulfillmentInventoryLocationId) =>
            setDraft({
              ...draft,
              storefront: { ...draft.storefront, fulfillmentInventoryLocationId },
            })
          }
          testIDPrefix="storefront-location"
        />
        <InfoRow
          label={t("set.currency")}
          value={draft.storefront.currency}
          testID="storefront-currency"
        />
        <Body>{t("set.currencyLockNote")}</Body>
        <BooleanField
          label={t("set.cod")}
          value={draft.storefront.codEnabled}
          onChange={(v) =>
            setDraft({ ...draft, storefront: { ...draft.storefront, codEnabled: v } })
          }
          testID="storefront-cod"
        />
      </SettingsSection>
      <SettingsSection title={t("set.returns")}>
        <BooleanField
          label={t("set.returnsEnabled")}
          value={draft.returns.enabled}
          onChange={(v) => setDraft({ ...draft, returns: { ...draft.returns, enabled: v } })}
          testID="returns-enabled"
        />
        <NumberField
          label={t("set.returnWindowDays")}
          value={windowDays}
          onChangeText={setWindowDays}
          testID="returns-window"
        />
        <BooleanField
          label={t("set.manualRefundsEnabled")}
          value={draft.returns.manualRefundsEnabled}
          onChange={(v) =>
            setDraft({ ...draft, returns: { ...draft.returns, manualRefundsEnabled: v } })
          }
          testID="manual-refunds"
        />
        <NumberField
          label={t("set.maxManualRefund")}
          value={maxRefund}
          onChangeText={setMaxRefund}
          testID="max-manual-refund"
        />
        <TextField
          label={t("set.allowedReasons")}
          value={allowedReasons}
          onChangeText={setAllowedReasons}
          testID="returns-reasons"
        />
      </SettingsSection>
      <SaveFeedback state={save} />
      <PrimaryButton
        label={t("set.saveCommerce")}
        testID="save-commerce"
        disabled={
          !draft.storefront.brandId ||
          !draft.storefront.fulfillmentInventoryLocationId ||
          (windowDays !== "" &&
            (!Number.isInteger(Number(windowDays)) || Number(windowDays) < 0)) ||
          save.status === "saving"
        }
        onPress={() => void runSave(onSave(submitted), setSave)}
      />
    </View>
  );
}

export function ReceiptForm({
  value,
  branchOptions = [],
  onBranchChange,
  onSave,
}: {
  value: ReceiptSettings;
  branchOptions?: SettingsOption[];
  onBranchChange?: (branchId: string) => Promise<ReceiptSettings>;
  onSave: (value: ReceiptSettings) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => ({
    ...value,
    businessDisplayName: tenantDisplayName(value.businessDisplayName),
  }));
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  return (
    <View style={{ gap: 12 }}>
      <SettingsSection title={t("set.tenantIdentity")}>
        <TextField
          label={t("set.businessDisplayName")}
          value={draft.businessDisplayName}
          onChangeText={(v) => setDraft({ ...draft, businessDisplayName: v })}
          testID="receipt-business-name"
        />
        <TextField
          label={t("set.legalName")}
          value={draft.legalName}
          onChangeText={(v) => setDraft({ ...draft, legalName: v })}
          testID="receipt-legal-name"
        />
        <TextField
          label={t("set.taxIdentifier")}
          value={draft.taxIdentifier}
          onChangeText={(v) => setDraft({ ...draft, taxIdentifier: v })}
          testID="receipt-tax-id"
        />
      </SettingsSection>
      <SettingsSection title={t("set.branchIdentity")}>
        {branchOptions.length ? (
          <SelectField
            label={t("set.branchContext")}
            options={branchOptions.map((option) => ({ value: option.id, label: option.label }))}
            selected={draft.branchId}
            onSelect={(branchId) => {
              if (onBranchChange) {
                void onBranchChange(branchId).then(
                  (next) =>
                    setDraft({
                      ...next,
                      businessDisplayName: tenantDisplayName(next.businessDisplayName),
                    }),
                  (error: unknown) => setSave({ status: "error", error }),
                );
              }
            }}
            testIDPrefix="receipt-branch"
          />
        ) : (
          <InfoRow label={t("set.branchContext")} value={draft.branchId ?? t("set.notSelected")} />
        )}
        <TextField
          label={t("set.branchAddr1")}
          value={draft.branchAddressLine1}
          onChangeText={(v) => setDraft({ ...draft, branchAddressLine1: v })}
          testID="receipt-address"
        />
        <TextField
          label={t("set.branchAddr2")}
          value={draft.branchAddressLine2}
          onChangeText={(v) => setDraft({ ...draft, branchAddressLine2: v })}
        />
        <TextField
          label={t("set.branchCity")}
          value={draft.branchCity}
          onChangeText={(v) => setDraft({ ...draft, branchCity: v })}
        />
        <TextField
          label={t("set.branchRegion")}
          value={draft.branchRegion}
          onChangeText={(v) => setDraft({ ...draft, branchRegion: v })}
        />
        <TextField
          label={t("set.branchPostal")}
          value={draft.branchPostalCode}
          onChangeText={(v) => setDraft({ ...draft, branchPostalCode: v })}
        />
        <TextField
          label={t("set.branchCountryCode")}
          value={draft.branchCountryCode}
          onChangeText={(v) => setDraft({ ...draft, branchCountryCode: v.toUpperCase() })}
        />
        <TextField
          label={t("set.branchContactEmail")}
          value={draft.branchContactEmail}
          onChangeText={(v) => setDraft({ ...draft, branchContactEmail: v })}
          autoCapitalize="none"
        />
        <TextField
          label={t("set.branchContactPhone")}
          value={draft.branchContactPhone}
          onChangeText={(v) => setDraft({ ...draft, branchContactPhone: v })}
          testID="receipt-contact"
        />
        <TextField
          label={t("set.receiptFooter")}
          value={draft.footer}
          onChangeText={(v) => setDraft({ ...draft, footer: v })}
          testID="receipt-footer"
          multiline
        />
      </SettingsSection>
      <SettingsSection title={t("set.fixedLayoutPreview")}>
        <View testID="receipt-preview" style={{ gap: 4 }}>
          <Title>{draft.businessDisplayName || t("set.businessNamePlaceholder")}</Title>
          <Body>{draft.legalName}</Body>
          <Body>{draft.taxIdentifier}</Body>
          <Body>
            {[
              draft.branchAddressLine1,
              draft.branchAddressLine2,
              draft.branchCity,
              draft.branchRegion,
              draft.branchPostalCode,
              draft.branchCountryCode,
            ]
              .filter(Boolean)
              .join(", ")}
          </Body>
          <Body>
            {[draft.branchContactEmail, draft.branchContactPhone].filter(Boolean).join(" · ")}
          </Body>
          <Body>{draft.footer}</Body>
        </View>
      </SettingsSection>
      <SaveFeedback state={save} />
      <PrimaryButton
        label={t("set.saveReceipt")}
        testID="save-receipt"
        disabled={!draft.businessDisplayName.trim() || save.status === "saving"}
        onPress={() => void runSave(onSave(draft), setSave)}
      />
    </View>
  );
}

function BooleanField({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID: string;
}) {
  const { t } = useI18n();
  return (
    <SelectField
      label={label}
      options={[
        { value: "yes", label: t("set.enabled") },
        { value: "no", label: t("set.disabled") },
      ]}
      selected={value ? "yes" : "no"}
      onSelect={(v) => onChange(v === "yes")}
      testIDPrefix={testID}
    />
  );
}

function SaveFeedback({ state }: { state: SaveState }) {
  if (state.status !== "error") return null;
  const error = describeSettingsError(state.error);
  return (
    <View testID={`settings-save-error-${error.kind}`} style={{ gap: 4 }}>
      <Title>{error.heading}</Title>
      <Body>{error.message}</Body>
    </View>
  );
}

async function runSave(promise: Promise<unknown>, setState: (value: SaveState) => void) {
  setState({ status: "saving" });
  try {
    await promise;
    setState({ status: "idle" });
  } catch (error) {
    setState({ status: "error", error });
  }
}
