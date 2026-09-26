import type { TenantCommerceClient } from "@shifted/clothing-commerce-sdk";

import type {
  BrandSettings,
  BrandSettingsDraft,
  BranchSettings,
  BranchSettingsDraft,
  BusinessSettings,
  BusinessSettingsDraft,
  CommerceSettings,
  DeviceSettings,
  InventoryLocationSettings,
  InventorySettingsOverview,
  ReceiptSettings,
  RegisterSettings,
  RegisterSettingsDraft,
  SettingsOption,
  SettingsStatus,
  WarehouseSettings,
} from "./model";

/**
 * Admin-owned view-model boundary. Screens never consume wire DTOs. Canonical transport binding is
 * pending SDK 0.14.0; keep mapping and SDK method names out of this interface until then.
 */
export interface SettingsAdapter {
  getBusiness(): Promise<BusinessSettings>;
  updateBusiness(draft: BusinessSettingsDraft): Promise<BusinessSettings>;
  listBrands(): Promise<BrandSettings[]>;
  getBrand(id: string): Promise<BrandSettings>;
  createBrand(draft: BrandSettingsDraft): Promise<BrandSettings>;
  updateBrand(id: string, draft: Omit<BrandSettingsDraft, "code">): Promise<BrandSettings>;
  setBrandStatus(id: string, status: SettingsStatus): Promise<BrandSettings>;
  listBranches(): Promise<BranchSettings[]>;
  getBranch(id: string): Promise<BranchSettings>;
  createBranch(draft: BranchSettingsDraft): Promise<BranchSettings>;
  updateBranch(id: string, draft: Omit<BranchSettingsDraft, "code">): Promise<BranchSettings>;
  setBranchStatus(id: string, status: SettingsStatus): Promise<BranchSettings>;
  getInventoryOverview(): Promise<InventorySettingsOverview>;
  getWarehouse(id: string): Promise<WarehouseSettings>;
  getInventoryLocation(id: string): Promise<InventoryLocationSettings>;
  updateWarehouse(id: string, value: WarehouseSettings): Promise<WarehouseSettings>;
  updateInventoryLocation(
    id: string,
    value: InventoryLocationSettings,
  ): Promise<InventoryLocationSettings>;
  listRegisters(): Promise<RegisterSettings[]>;
  getRegister(id: string): Promise<RegisterSettings>;
  createRegister(draft: RegisterSettingsDraft): Promise<RegisterSettings>;
  updateRegister(
    id: string,
    draft: Omit<RegisterSettingsDraft, "code" | "branchId">,
  ): Promise<RegisterSettings>;
  setRegisterStatus(id: string, status: SettingsStatus): Promise<RegisterSettings>;
  listDevices(): Promise<DeviceSettings[]>;
  getDevice(id: string): Promise<DeviceSettings>;
  revokeDevice(id: string): Promise<DeviceSettings>;
  assignDevice(id: string, registerId: string): Promise<DeviceSettings>;
  getCommerce(): Promise<CommerceSettings>;
  updateCommerce(value: CommerceSettings): Promise<CommerceSettings>;
  getReceipt(): Promise<ReceiptSettings>;
  updateReceipt(value: ReceiptSettings): Promise<ReceiptSettings>;
  listBranchOptions(): Promise<SettingsOption[]>;
  listInventoryLocationOptions(): Promise<SettingsOption[]>;
  listRegisterOptions(): Promise<SettingsOption[]>;
}

/** SDK 0.14.0 has not landed. Never substitute mock data or guessed HTTP calls in production. */
export function resolveSettingsAdapter(client: TenantCommerceClient): SettingsAdapter | null {
  void client;
  return null;
}
