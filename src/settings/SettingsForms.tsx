import { useState } from "react";
import { View } from "react-native";

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
  const [draft, setDraft] = useState<BusinessSettingsDraft>(() => ({
    displayName: value.displayName,
    legalName: value.legalName,
    contactEmail: value.contactEmail,
    contactPhone: value.contactPhone,
    timezone: value.timezone,
    country: value.country,
    taxIdentifier: value.taxIdentifier,
    defaultCurrency: value.defaultCurrency,
  }));
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const valid =
    draft.displayName.trim() && draft.timezone.trim() && /^[A-Z]{3}$/.test(draft.defaultCurrency);
  return (
    <View style={{ gap: 12 }}>
      <InfoRow label="Tenant identifier" value={value.id} />
      <InfoRow label="Tenant slug · read-only" value={value.slug} />
      <TextField
        label="Display name"
        value={draft.displayName}
        onChangeText={(v) => setDraft({ ...draft, displayName: v })}
        testID="business-display-name"
      />
      <TextField
        label="Legal name"
        value={draft.legalName}
        onChangeText={(v) => setDraft({ ...draft, legalName: v })}
        testID="business-legal-name"
      />
      <TextField
        label="Contact email"
        value={draft.contactEmail}
        onChangeText={(v) => setDraft({ ...draft, contactEmail: v })}
        testID="business-email"
        autoCapitalize="none"
      />
      <TextField
        label="Contact phone"
        value={draft.contactPhone}
        onChangeText={(v) => setDraft({ ...draft, contactPhone: v })}
        testID="business-phone"
      />
      <TextField
        label="Timezone"
        value={draft.timezone}
        onChangeText={(v) => setDraft({ ...draft, timezone: v })}
        testID="business-timezone"
      />
      <TextField
        label="Country"
        value={draft.country}
        onChangeText={(v) => setDraft({ ...draft, country: v })}
        testID="business-country"
      />
      <TextField
        label="Tax identifier"
        value={draft.taxIdentifier}
        onChangeText={(v) => setDraft({ ...draft, taxIdentifier: v })}
        testID="business-tax-id"
      />
      <TextField
        label="Default currency"
        value={draft.defaultCurrency}
        onChangeText={(v) => setDraft({ ...draft, defaultCurrency: v.toUpperCase() })}
        testID="business-currency"
        autoCapitalize="characters"
      />
      <Body testID="business-currency-warning">
        Changing the default currency may be restricted after commercial history exists. The server
        decides whether the change is allowed.
      </Body>
      <SaveFeedback state={save} />
      <PrimaryButton
        label={save.status === "saving" ? "Saving…" : "Save business settings"}
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
          label="Code"
          value={draft.code}
          onChangeText={(v) => setDraft({ ...draft, code: v.toUpperCase() })}
          testID="brand-code"
          autoCapitalize="characters"
        />
      ) : (
        <InfoRow label="Brand code · read-only" value={draft.code} />
      )}
      <TextField
        label="Display name"
        value={draft.displayName}
        onChangeText={(v) => setDraft({ ...draft, displayName: v })}
        testID="brand-display-name"
      />
      <TextField
        label="Legal name"
        value={draft.legalName}
        onChangeText={(v) => setDraft({ ...draft, legalName: v })}
        testID="brand-legal-name"
      />
      <SelectField
        label="Status"
        options={[
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ]}
        selected={draft.status}
        onSelect={(v) => setDraft({ ...draft, status: v as BrandSettingsDraft["status"] })}
        testIDPrefix="brand-status"
      />
      <SaveFeedback state={save} />
      <PrimaryButton
        label={
          save.status === "saving" ? "Saving…" : mode === "create" ? "Create Brand" : "Save Brand"
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
          label="Code"
          value={draft.code}
          onChangeText={(v) => setDraft({ ...draft, code: v.toUpperCase() })}
          testID="branch-code"
        />
      ) : (
        <InfoRow label="Branch code · read-only" value={draft.code} />
      )}
      <TextField
        label="Display name"
        value={draft.displayName}
        onChangeText={(v) => setDraft({ ...draft, displayName: v })}
        testID="branch-display-name"
      />
      <TextField
        label="Timezone"
        value={draft.timezone}
        onChangeText={(v) => setDraft({ ...draft, timezone: v })}
        testID="branch-timezone"
      />
      <TextField
        label="Address line 1"
        value={draft.addressLine1}
        onChangeText={(v) => setDraft({ ...draft, addressLine1: v, address: v })}
        testID="branch-address"
      />
      <TextField
        label="Address line 2"
        value={draft.addressLine2}
        onChangeText={(v) => setDraft({ ...draft, addressLine2: v })}
        testID="branch-address-2"
      />
      <TextField
        label="City"
        value={draft.city}
        onChangeText={(v) => setDraft({ ...draft, city: v })}
        testID="branch-city"
      />
      <TextField
        label="Region"
        value={draft.region}
        onChangeText={(v) => setDraft({ ...draft, region: v })}
        testID="branch-region"
      />
      <TextField
        label="Postal code"
        value={draft.postalCode}
        onChangeText={(v) => setDraft({ ...draft, postalCode: v })}
        testID="branch-postal-code"
      />
      <TextField
        label="Country code"
        value={draft.countryCode}
        onChangeText={(v) => setDraft({ ...draft, countryCode: v.toUpperCase() })}
        testID="branch-country-code"
      />
      <TextField
        label="Contact email"
        value={draft.contactEmail}
        onChangeText={(v) => setDraft({ ...draft, contactEmail: v })}
        testID="branch-email"
        autoCapitalize="none"
      />
      <TextField
        label="Contact phone"
        value={draft.contactPhone}
        onChangeText={(v) => setDraft({ ...draft, contactPhone: v })}
        testID="branch-phone"
      />
      <BooleanField
        label="Fulfillment"
        value={draft.fulfillmentEnabled}
        onChange={(v) => setDraft({ ...draft, fulfillmentEnabled: v })}
        testID="branch-fulfillment"
      />
      <BooleanField
        label="Click-and-collect"
        value={draft.clickAndCollectEnabled}
        onChange={(v) => setDraft({ ...draft, clickAndCollectEnabled: v })}
        testID="branch-collect"
      />
      <SelectField
        label="Default InventoryLocation"
        options={[
          { value: "", label: "None" },
          ...eligibleLocations.map((o) => ({ value: o.id, label: o.label })),
        ]}
        selected={draft.defaultInventoryLocationId ?? ""}
        onSelect={(v) => setDraft({ ...draft, defaultInventoryLocationId: v || null })}
        testIDPrefix="branch-location"
      />
      <TextField
        label="Receipt footer"
        value={draft.receiptFooter}
        onChangeText={(v) => setDraft({ ...draft, receiptFooter: v })}
        testID="branch-receipt-footer"
        multiline
      />
      {brandOptions.length ? (
        <SettingsSection title="Eligible Brands">
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
        label={mode === "create" ? "Create Branch" : "Save Branch"}
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
  const [draft, setDraft] = useState<RegisterSettingsDraft>(() => ({
    code: initial?.code ?? "",
    displayName: initial?.displayName ?? "",
    branchId: initial?.branchId ?? "",
    defaultInventoryLocationId: initial?.defaultInventoryLocationId ?? null,
    sellingCurrency: initial?.sellingCurrency ?? "",
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
          label="Code"
          value={draft.code}
          onChangeText={(v) => setDraft({ ...draft, code: v.toUpperCase() })}
          testID="register-code"
        />
      ) : (
        <InfoRow label="Register code · read-only" value={draft.code} />
      )}
      <TextField
        label="Display name"
        value={draft.displayName}
        onChangeText={(v) => setDraft({ ...draft, displayName: v })}
        testID="register-display-name"
      />
      {mode === "create" ? (
        <SelectField
          label="Branch"
          options={branchOptions.map((o) => ({ value: o.id, label: o.label }))}
          selected={draft.branchId}
          onSelect={(v) => setDraft({ ...draft, branchId: v })}
          testIDPrefix="register-branch"
        />
      ) : (
        <InfoRow label="Branch · read-only" value={initial?.branchName ?? draft.branchId} />
      )}
      <SelectField
        label="Default InventoryLocation"
        options={[
          { value: "", label: "None" },
          ...eligibleLocations.map((o) => ({ value: o.id, label: o.label })),
        ]}
        selected={draft.defaultInventoryLocationId ?? ""}
        onSelect={(v) => setDraft({ ...draft, defaultInventoryLocationId: v || null })}
        testIDPrefix="register-location"
      />
      <TextField
        label="Selling currency"
        value={draft.sellingCurrency}
        onChangeText={(v) => setDraft({ ...draft, sellingCurrency: v.toUpperCase() })}
        testID="register-currency"
      />
      <Body>
        Currency changes may be rejected after this Register records sales. The server decides.
      </Body>
      <SaveFeedback state={save} />
      <PrimaryButton
        label={mode === "create" ? "Create Register" : "Save Register"}
        testID="save-register"
        disabled={
          !draft.code.trim() ||
          !draft.displayName.trim() ||
          !draft.branchId ||
          !/^[A-Z]{3}$/.test(draft.sellingCurrency) ||
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
        label="Code"
        value={draft.code}
        onChangeText={(code) => setDraft({ ...draft, code: code.toUpperCase() })}
        testID="warehouse-code"
      />
      <TextField
        label="Display name"
        value={draft.displayName}
        onChangeText={(displayName) => setDraft({ ...draft, displayName })}
        testID="warehouse-display-name"
      />
      <TextField
        label="Timezone"
        value={draft.timezone}
        onChangeText={(timezone) => setDraft({ ...draft, timezone })}
        testID="warehouse-timezone"
      />
      <TextField
        label="Address line 1"
        value={draft.addressLine1}
        onChangeText={(addressLine1) => setDraft({ ...draft, addressLine1 })}
        testID="warehouse-address"
      />
      <TextField
        label="Address line 2"
        value={draft.addressLine2}
        onChangeText={(addressLine2) => setDraft({ ...draft, addressLine2 })}
      />
      <TextField
        label="City"
        value={draft.city}
        onChangeText={(city) => setDraft({ ...draft, city })}
      />
      <TextField
        label="Region"
        value={draft.region}
        onChangeText={(region) => setDraft({ ...draft, region })}
      />
      <TextField
        label="Postal code"
        value={draft.postalCode}
        onChangeText={(postalCode) => setDraft({ ...draft, postalCode })}
      />
      <TextField
        label="Country code"
        value={draft.countryCode}
        onChangeText={(countryCode) =>
          setDraft({ ...draft, countryCode: countryCode.toUpperCase() })
        }
      />
      <TextField
        label="Contact email"
        value={draft.contactEmail}
        onChangeText={(contactEmail) => setDraft({ ...draft, contactEmail })}
        autoCapitalize="none"
      />
      <TextField
        label="Contact phone"
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
        label={save.status === "saving" ? "Creating…" : "Create Warehouse"}
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
        label="Code"
        value={draft.code}
        onChangeText={(code) => setDraft({ ...draft, code: code.toUpperCase() })}
        testID="location-code"
      />
      <TextField
        label="Display name"
        value={draft.displayName}
        onChangeText={(displayName) => setDraft({ ...draft, displayName })}
        testID="location-display-name"
      />
      <SelectField
        label="Parent (Branch or Warehouse)"
        options={[
          ...branchOptions.map((item) => ({
            value: `branch:${item.id}`,
            label: `Branch · ${item.label}`,
          })),
          ...warehouseOptions.map((item) => ({
            value: `warehouse:${item.id}`,
            label: `Warehouse · ${item.label}`,
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
        label="Location type"
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
        label={save.status === "saving" ? "Creating…" : "Create InventoryLocation"}
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
  const fields: Array<[keyof CapabilityFlags, string]> = [
    ...(includeSellable
      ? [["sellable" as keyof CapabilityFlags, "Sellable"] as [keyof CapabilityFlags, string]]
      : []),
    ["fulfillment", "Fulfillment"],
    ["receiving", "Receiving"],
    ["transferOrigin", "Transfer origin"],
    ["transferDestination", "Transfer destination"],
  ];
  return (
    <SettingsSection title="Capability flags">
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
  const [draft, setDraft] = useState(value);
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
      <SettingsSection title="Storefront">
        <SelectField
          label="Brand/context"
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
          label="Fulfillment InventoryLocation"
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
        <TextField
          label="Currency"
          value={draft.storefront.currency}
          onChangeText={(v) =>
            setDraft({ ...draft, storefront: { ...draft.storefront, currency: v.toUpperCase() } })
          }
          testID="storefront-currency"
        />
        <Body>Currency changes may be locked by commercial history. The server decides.</Body>
        <BooleanField
          label="Cash on delivery (COD)"
          value={draft.storefront.codEnabled}
          onChange={(v) =>
            setDraft({ ...draft, storefront: { ...draft.storefront, codEnabled: v } })
          }
          testID="storefront-cod"
        />
      </SettingsSection>
      <SettingsSection title="Returns">
        <BooleanField
          label="Returns enabled"
          value={draft.returns.enabled}
          onChange={(v) => setDraft({ ...draft, returns: { ...draft.returns, enabled: v } })}
          testID="returns-enabled"
        />
        <NumberField
          label="Return window days"
          value={windowDays}
          onChangeText={setWindowDays}
          testID="returns-window"
        />
        <BooleanField
          label="Manual refunds enabled"
          value={draft.returns.manualRefundsEnabled}
          onChange={(v) =>
            setDraft({ ...draft, returns: { ...draft.returns, manualRefundsEnabled: v } })
          }
          testID="manual-refunds"
        />
        <NumberField
          label="Maximum manual refund (minor units, optional)"
          value={maxRefund}
          onChangeText={setMaxRefund}
          testID="max-manual-refund"
        />
        <TextField
          label="Allowed reasons (comma separated)"
          value={allowedReasons}
          onChangeText={setAllowedReasons}
          testID="returns-reasons"
        />
      </SettingsSection>
      <SaveFeedback state={save} />
      <PrimaryButton
        label="Save commerce settings"
        testID="save-commerce"
        disabled={
          !draft.storefront.brandId ||
          !draft.storefront.fulfillmentInventoryLocationId ||
          !/^[A-Z]{3}$/.test(draft.storefront.currency) ||
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
  const [draft, setDraft] = useState(value);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  return (
    <View style={{ gap: 12 }}>
      <SettingsSection title="Tenant identity">
        <TextField
          label="Business/display name"
          value={draft.businessDisplayName}
          onChangeText={(v) => setDraft({ ...draft, businessDisplayName: v })}
          testID="receipt-business-name"
        />
        <TextField
          label="Legal name"
          value={draft.legalName}
          onChangeText={(v) => setDraft({ ...draft, legalName: v })}
          testID="receipt-legal-name"
        />
        <TextField
          label="Tax identifier"
          value={draft.taxIdentifier}
          onChangeText={(v) => setDraft({ ...draft, taxIdentifier: v })}
          testID="receipt-tax-id"
        />
      </SettingsSection>
      <SettingsSection title="Branch identity">
        {branchOptions.length ? (
          <SelectField
            label="Branch context"
            options={branchOptions.map((option) => ({ value: option.id, label: option.label }))}
            selected={draft.branchId}
            onSelect={(branchId) => {
              if (onBranchChange) {
                void onBranchChange(branchId).then(setDraft, (error: unknown) =>
                  setSave({ status: "error", error }),
                );
              }
            }}
            testIDPrefix="receipt-branch"
          />
        ) : (
          <InfoRow label="Branch context" value={draft.branchId ?? "Not selected"} />
        )}
        <TextField
          label="Branch address line 1"
          value={draft.branchAddressLine1}
          onChangeText={(v) => setDraft({ ...draft, branchAddressLine1: v })}
          testID="receipt-address"
        />
        <TextField
          label="Branch address line 2"
          value={draft.branchAddressLine2}
          onChangeText={(v) => setDraft({ ...draft, branchAddressLine2: v })}
        />
        <TextField
          label="Branch city"
          value={draft.branchCity}
          onChangeText={(v) => setDraft({ ...draft, branchCity: v })}
        />
        <TextField
          label="Branch region"
          value={draft.branchRegion}
          onChangeText={(v) => setDraft({ ...draft, branchRegion: v })}
        />
        <TextField
          label="Branch postal code"
          value={draft.branchPostalCode}
          onChangeText={(v) => setDraft({ ...draft, branchPostalCode: v })}
        />
        <TextField
          label="Branch country code"
          value={draft.branchCountryCode}
          onChangeText={(v) => setDraft({ ...draft, branchCountryCode: v.toUpperCase() })}
        />
        <TextField
          label="Branch contact email"
          value={draft.branchContactEmail}
          onChangeText={(v) => setDraft({ ...draft, branchContactEmail: v })}
          autoCapitalize="none"
        />
        <TextField
          label="Branch contact phone"
          value={draft.branchContactPhone}
          onChangeText={(v) => setDraft({ ...draft, branchContactPhone: v })}
          testID="receipt-contact"
        />
        <TextField
          label="Receipt footer"
          value={draft.footer}
          onChangeText={(v) => setDraft({ ...draft, footer: v })}
          testID="receipt-footer"
          multiline
        />
      </SettingsSection>
      <SettingsSection title="Fixed-layout preview">
        <View testID="receipt-preview" style={{ gap: 4 }}>
          <Title>{draft.businessDisplayName || "Business name"}</Title>
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
        label="Save receipt identity"
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
  return (
    <SelectField
      label={label}
      options={[
        { value: "yes", label: "Enabled" },
        { value: "no", label: "Disabled" },
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
