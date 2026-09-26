export type SettingsStatus = "active" | "inactive" | "archived";

export interface BusinessSettings {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  contactEmail: string;
  contactPhone: string;
  timezone: string;
  country: string;
  taxIdentifier: string;
  defaultCurrency: string;
}

export type BusinessSettingsDraft = Omit<BusinessSettings, "id" | "slug">;

export interface BrandSettings {
  id: string;
  code: string;
  displayName: string;
  legalName: string;
  status: SettingsStatus;
}

export type BrandSettingsDraft = Omit<BrandSettings, "id">;

export interface BranchSettings {
  id: string;
  code: string;
  displayName: string;
  timezone: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  fulfillmentEnabled: boolean;
  clickAndCollectEnabled: boolean;
  defaultInventoryLocationId: string | null;
  receiptFooter: string;
  eligibleBrandIds?: string[];
  status: SettingsStatus;
}

export type BranchSettingsDraft = Omit<BranchSettings, "id">;

export interface CapabilityFlags {
  canReceive: boolean;
  canAdjust: boolean;
  canTransferFrom: boolean;
  canTransferTo: boolean;
  canFulfill: boolean;
}

export interface WarehouseSettings {
  id: string;
  code: string;
  displayName: string;
  status: SettingsStatus;
  capabilities: CapabilityFlags;
}

export interface InventoryLocationSettings {
  id: string;
  code: string;
  displayName: string;
  parentId: string;
  parentName: string;
  parentKind: "branch" | "warehouse";
  locationType: string;
  status: SettingsStatus;
  capabilities: CapabilityFlags;
}

export interface RegisterSettings {
  id: string;
  code: string;
  displayName: string;
  branchId: string;
  branchName: string;
  defaultInventoryLocationId: string | null;
  sellingCurrency: string;
  status: SettingsStatus;
}

export type RegisterSettingsDraft = Omit<RegisterSettings, "id" | "branchName">;

export interface DeviceSettings {
  id: string;
  displayName: string;
  status: "active" | "revoked";
  registerId: string | null;
  registerName: string | null;
  lastSeenAt: string | null;
}

export interface StorefrontSettings {
  brandId: string | null;
  fulfillmentInventoryLocationId: string | null;
  currency: string;
  codEnabled: boolean;
}

export interface ReturnsSettings {
  enabled: boolean;
  windowDays: number;
  manualRefundsEnabled: boolean;
  maxManualRefundMinor: number | null;
  allowedReasons?: string[];
}

export interface CommerceSettings {
  storefront: StorefrontSettings;
  returns: ReturnsSettings;
}

export interface ReceiptSettings {
  businessDisplayName: string;
  legalName: string;
  taxIdentifier: string;
  branchId: string | null;
  branchAddress: string;
  branchContact: string;
  footer: string;
}

export interface SettingsOption {
  id: string;
  label: string;
}

export interface InventorySettingsOverview {
  warehouses: WarehouseSettings[];
  locations: InventoryLocationSettings[];
}
