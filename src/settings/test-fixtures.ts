import type { SettingsAdapter } from "./adapter";
import type {
  BrandSettings,
  BranchSettings,
  BusinessSettings,
  CommerceSettings,
  DeviceSettings,
  InventoryLocationSettings,
  ReceiptSettings,
  RegisterSettings,
  WarehouseSettings,
} from "./model";

export const SETTINGS_ID = "11111111-2222-4333-8444-555555555555";

export const business: BusinessSettings = {
  id: SETTINGS_ID,
  slug: "acme-apparel",
  displayName: "Acme Apparel",
  legalName: "Acme Apparel LLC",
  contactEmail: "hello@acme.example",
  contactPhone: "+20 10 1234 5678",
  timezone: "Africa/Cairo",
  country: "EG",
  taxIdentifier: "TAX-1001",
  defaultCurrency: "EGP",
};
export const brand: BrandSettings = {
  id: "brand-1",
  code: "ACME",
  displayName: "Acme",
  legalName: "Acme Apparel LLC",
  status: "active",
};
export const branch: BranchSettings = {
  id: "branch-1",
  code: "CAI",
  displayName: "Cairo Flagship",
  timezone: "Africa/Cairo",
  address: "12 Nile Street",
  contactEmail: "cairo@acme.example",
  contactPhone: "+20 10 1111 2222",
  fulfillmentEnabled: true,
  clickAndCollectEnabled: true,
  defaultInventoryLocationId: "location-1",
  receiptFooter: "Thank you",
  status: "active",
};
const capabilities = {
  canReceive: true,
  canAdjust: true,
  canTransferFrom: true,
  canTransferTo: true,
  canFulfill: true,
};
export const warehouse: WarehouseSettings = {
  id: "warehouse-1",
  code: "WH-CAI",
  displayName: "Cairo Warehouse",
  status: "active",
  capabilities,
};
export const location: InventoryLocationSettings = {
  id: "location-1",
  code: "STOCK",
  displayName: "Flagship Stockroom",
  parentId: branch.id,
  parentName: branch.displayName,
  parentKind: "branch",
  locationType: "stockroom",
  status: "active",
  capabilities,
};
export const register: RegisterSettings = {
  id: "register-1",
  code: "REG-01",
  displayName: "Front Till",
  branchId: branch.id,
  branchName: branch.displayName,
  defaultInventoryLocationId: location.id,
  sellingCurrency: "EGP",
  status: "active",
};
export const device: DeviceSettings = {
  id: "device-1",
  displayName: "Front iPad",
  status: "active",
  registerId: register.id,
  registerName: register.displayName,
  lastSeenAt: "2026-09-26T08:00:00Z",
};
export const commerce: CommerceSettings = {
  storefront: {
    brandId: brand.id,
    fulfillmentInventoryLocationId: location.id,
    currency: "EGP",
    codEnabled: true,
  },
  returns: {
    enabled: true,
    windowDays: 14,
    manualRefundsEnabled: true,
    maxManualRefundMinor: 50000,
    allowedReasons: ["Wrong size", "Damaged"],
  },
};
export const receipt: ReceiptSettings = {
  businessDisplayName: business.displayName,
  legalName: business.legalName,
  taxIdentifier: business.taxIdentifier,
  branchId: branch.id,
  branchAddress: branch.address,
  branchContact: branch.contactPhone,
  footer: branch.receiptFooter,
};

export function fakeSettingsAdapter(overrides: Partial<SettingsAdapter> = {}): SettingsAdapter {
  return {
    getBusiness: async () => business,
    updateBusiness: async (draft) => ({ ...business, ...draft }),
    listBrands: async () => [brand],
    getBrand: async () => brand,
    createBrand: async (draft) => ({ ...draft, id: brand.id }),
    updateBrand: async (id, draft) => ({ ...brand, ...draft, id }),
    setBrandStatus: async (id, status) => ({ ...brand, id, status }),
    listBranches: async () => [branch],
    getBranch: async () => branch,
    createBranch: async (draft) => ({ ...draft, id: branch.id }),
    updateBranch: async (id, draft) => ({ ...branch, ...draft, id }),
    setBranchStatus: async (id, status) => ({ ...branch, id, status }),
    getInventoryOverview: async () => ({ warehouses: [warehouse], locations: [location] }),
    getWarehouse: async () => warehouse,
    getInventoryLocation: async () => location,
    updateWarehouse: async (_id, value) => value,
    updateInventoryLocation: async (_id, value) => value,
    listRegisters: async () => [register],
    getRegister: async () => register,
    createRegister: async (draft) => ({
      ...draft,
      id: register.id,
      branchName: branch.displayName,
    }),
    updateRegister: async (id, draft) => ({ ...register, ...draft, id }),
    setRegisterStatus: async (id, status) => ({ ...register, id, status }),
    listDevices: async () => [device],
    getDevice: async () => device,
    revokeDevice: async (id) => ({ ...device, id, status: "revoked" }),
    assignDevice: async (id, registerId) => ({ ...device, id, registerId }),
    getCommerce: async () => commerce,
    updateCommerce: async (value) => value,
    getReceipt: async () => receipt,
    updateReceipt: async (value) => value,
    listBranchOptions: async () => [{ id: branch.id, label: branch.displayName }],
    listInventoryLocationOptions: async () => [{ id: location.id, label: location.displayName }],
    listRegisterOptions: async () => [{ id: register.id, label: register.displayName }],
    ...overrides,
  };
}
