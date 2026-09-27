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
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
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
  sellable?: boolean;
  receiving: boolean;
  transferOrigin: boolean;
  transferDestination: boolean;
  fulfillment: boolean;
}

export interface WarehouseSettings {
  id: string;
  code: string;
  displayName: string;
  timezone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  contactEmail: string;
  contactPhone: string;
  status: SettingsStatus;
  capabilities: CapabilityFlags;
}

export type WarehouseSettingsDraft = Omit<WarehouseSettings, "id" | "status">;

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

export interface InventoryLocationSettingsDraft {
  code: string;
  displayName: string;
  parentId: string;
  parentKind: "branch" | "warehouse";
  locationType: string;
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
  installationId: string;
  deviceType: string;
  status: "enrolled" | "active" | "revoked";
  clientVersion: string | null;
  platform: string | null;
  osVersion: string | null;
  registerId: string | null;
  registerName: string | null;
  lastSeenAt: string | null;
}

export interface StorefrontSettings {
  brandId: string;
  brandName: string;
  fulfillmentInventoryLocationId: string;
  currency: string;
  codEnabled: boolean;
}

export interface ReturnsSettings {
  enabled: boolean;
  windowDays: number | null;
  manualRefundsEnabled: boolean;
  maxManualRefundMinor: number | null;
  allowedReasons?: string[];
}

export interface CommerceSettings {
  storefront: StorefrontSettings;
  storefronts: StorefrontSettings[];
  returns: ReturnsSettings;
}

export interface ReceiptSettings {
  businessDisplayName: string;
  legalName: string;
  taxIdentifier: string;
  branchId: string | null;
  branchAddressLine1: string;
  branchAddressLine2: string;
  branchCity: string;
  branchRegion: string;
  branchPostalCode: string;
  branchCountryCode: string;
  branchContactEmail: string;
  branchContactPhone: string;
  footer: string;
}

export interface SettingsOption {
  id: string;
  label: string;
  parentId?: string;
  parentKind?: "branch" | "warehouse";
}

export interface InventorySettingsOverview {
  warehouses: WarehouseSettings[];
  locations: InventoryLocationSettings[];
}
