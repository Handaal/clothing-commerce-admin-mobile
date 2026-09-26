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
  CommerceSettings,
  ReceiptSettings,
  RegisterSettings,
  RegisterSettingsDraft,
  SettingsOption,
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
  onSave,
}: {
  mode: "create" | "edit";
  initial?: BranchSettings;
  locationOptions: SettingsOption[];
  onSave: (draft: BranchSettingsDraft) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<BranchSettingsDraft>(() => ({
    code: initial?.code ?? "",
    displayName: initial?.displayName ?? "",
    timezone: initial?.timezone ?? "",
    address: initial?.address ?? "",
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
        label="Address"
        value={draft.address}
        onChangeText={(v) => setDraft({ ...draft, address: v })}
        testID="branch-address"
        multiline
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
          ...locationOptions.map((o) => ({ value: o.id, label: o.label })),
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
          ...locationOptions.map((o) => ({ value: o.id, label: o.label })),
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

export function CommerceForm({
  value,
  onSave,
}: {
  value: CommerceSettings;
  onSave: (value: CommerceSettings) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value);
  const [windowDays, setWindowDays] = useState(String(value.returns.windowDays));
  const [maxRefund, setMaxRefund] = useState(
    value.returns.maxManualRefundMinor === null ? "" : String(value.returns.maxManualRefundMinor),
  );
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const submitted: CommerceSettings = {
    ...draft,
    returns: {
      ...draft.returns,
      windowDays: Number(windowDays),
      maxManualRefundMinor: maxRefund ? Number(maxRefund) : null,
    },
  };
  return (
    <View style={{ gap: 12 }}>
      <SettingsSection title="Storefront">
        <TextField
          label="Brand/context identifier (optional)"
          value={draft.storefront.brandId ?? ""}
          onChangeText={(v) =>
            setDraft({ ...draft, storefront: { ...draft.storefront, brandId: v || null } })
          }
          testID="storefront-brand"
        />
        <TextField
          label="Fulfillment InventoryLocation"
          value={draft.storefront.fulfillmentInventoryLocationId ?? ""}
          onChangeText={(v) =>
            setDraft({
              ...draft,
              storefront: { ...draft.storefront, fulfillmentInventoryLocationId: v || null },
            })
          }
          testID="storefront-location"
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
        {draft.returns.allowedReasons ? (
          <Body>Allowed reasons: {draft.returns.allowedReasons.join(", ")}</Body>
        ) : null}
      </SettingsSection>
      <SaveFeedback state={save} />
      <PrimaryButton
        label="Save commerce settings"
        testID="save-commerce"
        disabled={
          !Number.isInteger(Number(windowDays)) ||
          Number(windowDays) < 0 ||
          save.status === "saving"
        }
        onPress={() => void runSave(onSave(submitted), setSave)}
      />
    </View>
  );
}

export function ReceiptForm({
  value,
  onSave,
}: {
  value: ReceiptSettings;
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
        <InfoRow label="Branch context" value={draft.branchId ?? "Not selected"} />
        <TextField
          label="Branch address"
          value={draft.branchAddress}
          onChangeText={(v) => setDraft({ ...draft, branchAddress: v })}
          testID="receipt-address"
          multiline
        />
        <TextField
          label="Branch contact"
          value={draft.branchContact}
          onChangeText={(v) => setDraft({ ...draft, branchContact: v })}
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
          <Body>{draft.branchAddress}</Body>
          <Body>{draft.branchContact}</Body>
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
