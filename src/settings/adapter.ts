import {
  ApiHttpError,
  ApiNetworkError,
  type Branch,
  type Brand,
  type BusinessSettings as SdkBusinessSettings,
  type Device,
  type InventoryLocation,
  type Register,
  type ReturnSettings,
  type StorefrontSettings as SdkStorefrontSettings,
  type TenantCommerceClient,
  type Warehouse,
} from "@shifted/clothing-commerce-sdk";

import { collectAllPages } from "../commerce/pagination";
import { secureIdempotencyKey } from "../inventory/idempotency";
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
  InventoryLocationSettingsDraft,
  InventorySettingsOverview,
  ReceiptSettings,
  RegisterSettings,
  RegisterSettingsDraft,
  SettingsOption,
  SettingsStatus,
  WarehouseSettings,
  WarehouseSettingsDraft,
} from "./model";

/** Admin-owned view-model boundary. Raw SDK DTOs remain in this module. */
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
  createWarehouse(draft: WarehouseSettingsDraft): Promise<WarehouseSettings>;
  updateWarehouse(id: string, value: WarehouseSettings): Promise<WarehouseSettings>;
  getInventoryLocation(id: string): Promise<InventoryLocationSettings>;
  createInventoryLocation(
    draft: InventoryLocationSettingsDraft,
  ): Promise<InventoryLocationSettings>;
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
  getReceipt(branchId?: string): Promise<ReceiptSettings>;
  updateReceipt(value: ReceiptSettings): Promise<ReceiptSettings>;
  listBrandOptions(): Promise<SettingsOption[]>;
  listBranchOptions(): Promise<SettingsOption[]>;
  listWarehouseOptions(): Promise<SettingsOption[]>;
  listInventoryLocationOptions(): Promise<SettingsOption[]>;
  listRegisterOptions(): Promise<SettingsOption[]>;
}

const adapterCache = new WeakMap<TenantCommerceClient, SettingsAdapter>();

/** Reuse a key for an ambiguous retry of the same intent and coalesce duplicate in-flight calls. */
function idempotentMutations() {
  const operations = new Map<string, { key: string; inFlight?: Promise<unknown> }>();
  return async function mutate<T>(
    operation: string,
    intent: unknown,
    request: (idempotencyKey: string) => Promise<T>,
  ): Promise<T> {
    const fingerprint = `${operation}:${JSON.stringify(intent)}`;
    let entry = operations.get(fingerprint);
    if (!entry) {
      entry = { key: secureIdempotencyKey() };
      operations.set(fingerprint, entry);
    }
    if (entry.inFlight) return entry.inFlight as Promise<T>;
    const promise = request(entry.key);
    entry.inFlight = promise;
    try {
      const result = await promise;
      operations.delete(fingerprint);
      return result;
    } catch (error) {
      entry.inFlight = undefined;
      if (!isAmbiguous(error)) operations.delete(fingerprint);
      throw error;
    }
  };
}

function isAmbiguous(error: unknown) {
  return error instanceof ApiNetworkError || (error instanceof ApiHttpError && error.status >= 500);
}

export function resolveSettingsAdapter(client: TenantCommerceClient): SettingsAdapter {
  const cached = adapterCache.get(client);
  if (cached) return cached;
  const mutate = idempotentMutations();

  const allBrands = () => collectAllPages((cursor) => client.listBrands({ limit: 100, cursor }));
  const allBranches = () =>
    collectAllPages((cursor) => client.listBranches({ limit: 100, cursor }));
  const allWarehouses = () =>
    collectAllPages((cursor) => client.listWarehouses({ limit: 100, cursor }));
  const allLocations = () =>
    collectAllPages((cursor) => client.listInventoryLocations({ limit: 100, cursor }));
  const allRegisters = () =>
    collectAllPages((cursor) => client.listRegisters({ limit: 100, cursor }));
  const allDevices = () => collectAllPages((cursor) => client.listDevices({ limit: 100, cursor }));
  const branchNames = async () =>
    new Map((await allBranches()).map((branch) => [branch.id, branch.displayName]));

  async function mapLocationWithParent(dto: InventoryLocation) {
    const [branches, warehouses] = await Promise.all([allBranches(), allWarehouses()]);
    return mapLocation(
      dto,
      new Map(branches.map((item) => [item.id, item.displayName])),
      new Map(warehouses.map((item) => [item.id, item.displayName])),
    );
  }

  const adapter: SettingsAdapter = {
    async getBusiness() {
      return mapBusiness(await client.getBusinessSettings());
    },
    async updateBusiness(draft) {
      return mapBusiness(
        await mutate("business:update", draft, (idempotencyKey) =>
          client.updateBusinessSettings({
            displayName: draft.displayName,
            legalName: nullIfBlank(draft.legalName),
            contactEmail: nullIfBlank(draft.contactEmail),
            contactPhone: nullIfBlank(draft.contactPhone),
            defaultTimezone: draft.timezone,
            countryCode: nullIfBlank(draft.country),
            taxIdentifier: nullIfBlank(draft.taxIdentifier),
            defaultCurrency: draft.defaultCurrency,
            idempotencyKey,
          }),
        ),
      );
    },
    async listBrands() {
      return (await allBrands()).map(mapBrand);
    },
    async getBrand(id) {
      return mapBrand(await client.getBrand(id));
    },
    async createBrand(draft) {
      const created = await mutate("brand:create", draft, (idempotencyKey) =>
        client.createBrand({
          code: draft.code,
          displayName: draft.displayName,
          legalName: nullIfBlank(draft.legalName),
          idempotencyKey,
        }),
      );
      if (draft.status !== "active") {
        return mapBrand(
          await mutate(
            "brand:lifecycle",
            { id: created.id, status: draft.status },
            (idempotencyKey) =>
              client.updateBrand({
                brandId: created.id,
                status: draft.status,
                idempotencyKey,
              }),
          ),
        );
      }
      return mapBrand(created);
    },
    async updateBrand(id, draft) {
      return mapBrand(
        await mutate("brand:update", { id, draft }, (idempotencyKey) =>
          client.updateBrand({
            brandId: id,
            displayName: draft.displayName,
            legalName: nullIfBlank(draft.legalName),
            status: draft.status,
            idempotencyKey,
          }),
        ),
      );
    },
    async setBrandStatus(id, status) {
      return mapBrand(
        await mutate("brand:lifecycle", { id, status }, (idempotencyKey) =>
          client.updateBrand({ brandId: id, status, idempotencyKey }),
        ),
      );
    },
    async listBranches() {
      return (await allBranches()).map(mapBranch);
    },
    async getBranch(id) {
      return mapBranch(await client.getBranch(id));
    },
    async createBranch(draft) {
      const created = await mutate("branch:create", draft, (idempotencyKey) =>
        client.createBranch({ ...branchRequest(draft), code: draft.code, idempotencyKey }),
      );
      if (draft.eligibleBrandIds) {
        return mapBranch(
          await mutate(
            "branch:brands",
            { id: created.id, brandIds: draft.eligibleBrandIds },
            (idempotencyKey) =>
              client.setBranchBrands({
                branchId: created.id,
                brandIds: draft.eligibleBrandIds ?? [],
                idempotencyKey,
              }),
          ),
        );
      }
      return mapBranch(created);
    },
    async updateBranch(id, draft) {
      let updated = await mutate("branch:update", { id, draft }, (idempotencyKey) =>
        client.updateBranch({ branchId: id, ...branchRequest(draft), idempotencyKey }),
      );
      if (draft.eligibleBrandIds) {
        updated = await mutate(
          "branch:brands",
          { id, brandIds: draft.eligibleBrandIds },
          (idempotencyKey) =>
            client.setBranchBrands({
              branchId: id,
              brandIds: draft.eligibleBrandIds ?? [],
              idempotencyKey,
            }),
        );
      }
      return mapBranch(updated);
    },
    async setBranchStatus(id, status) {
      return mapBranch(
        await mutate("branch:lifecycle", { id, status }, (idempotencyKey) =>
          client.updateBranch({ branchId: id, status, idempotencyKey }),
        ),
      );
    },
    async getInventoryOverview() {
      const [warehouses, locations, branches] = await Promise.all([
        allWarehouses(),
        allLocations(),
        allBranches(),
      ]);
      const warehouseMap = new Map(warehouses.map((item) => [item.id, item.displayName]));
      const branchMap = new Map(branches.map((item) => [item.id, item.displayName]));
      return {
        warehouses: warehouses.map(mapWarehouse),
        locations: locations.map((item) => mapLocation(item, branchMap, warehouseMap)),
      };
    },
    async getWarehouse(id) {
      return mapWarehouse(await client.getWarehouse(id));
    },
    async createWarehouse(draft) {
      return mapWarehouse(
        await mutate("warehouse:create", draft, (idempotencyKey) =>
          client.createWarehouse({ ...warehouseRequest(draft), code: draft.code, idempotencyKey }),
        ),
      );
    },
    async updateWarehouse(id, value) {
      return mapWarehouse(
        await mutate("warehouse:update", { id, value }, (idempotencyKey) =>
          client.updateWarehouse({
            warehouseId: id,
            ...warehouseRequest(value),
            status: value.status,
            idempotencyKey,
          }),
        ),
      );
    },
    async getInventoryLocation(id) {
      return mapLocationWithParent(await client.getInventoryLocation(id));
    },
    async createInventoryLocation(draft) {
      const created = await mutate("location:create", draft, (idempotencyKey) =>
        client.createInventoryLocation({
          code: draft.code,
          displayName: draft.displayName,
          locationType: draft.locationType,
          ...(draft.parentKind === "branch"
            ? { branchId: draft.parentId }
            : { warehouseId: draft.parentId }),
          ...locationCapabilities(draft.capabilities),
          idempotencyKey,
        }),
      );
      return mapLocationWithParent(created);
    },
    async updateInventoryLocation(id, value) {
      const updated = await mutate("location:update", { id, value }, (idempotencyKey) =>
        client.updateInventoryLocation({
          locationId: id,
          displayName: value.displayName,
          status: value.status,
          ...locationCapabilities(value.capabilities),
          idempotencyKey,
        }),
      );
      return mapLocationWithParent(updated);
    },
    async listRegisters() {
      const [registers, names] = await Promise.all([allRegisters(), branchNames()]);
      return registers.map((item) => mapRegister(item, names));
    },
    async getRegister(id) {
      return mapRegister(await client.getRegister(id), await branchNames());
    },
    async createRegister(draft) {
      const created = await mutate("register:create", draft, (idempotencyKey) =>
        client.createRegister({
          branchId: draft.branchId,
          code: draft.code,
          displayName: draft.displayName,
          defaultInventoryLocationId: draft.defaultInventoryLocationId,
          sellingCurrency: draft.sellingCurrency,
          status: draft.status,
          idempotencyKey,
        }),
      );
      return mapRegister(created, await branchNames());
    },
    async updateRegister(id, draft) {
      const updated = await mutate("register:update", { id, draft }, (idempotencyKey) =>
        client.updateRegister({
          registerId: id,
          displayName: draft.displayName,
          defaultInventoryLocationId: draft.defaultInventoryLocationId,
          sellingCurrency: draft.sellingCurrency,
          status: draft.status,
          idempotencyKey,
        }),
      );
      return mapRegister(updated, await branchNames());
    },
    async setRegisterStatus(id, status) {
      const updated = await mutate("register:lifecycle", { id, status }, (idempotencyKey) =>
        client.updateRegister({ registerId: id, status, idempotencyKey }),
      );
      return mapRegister(updated, await branchNames());
    },
    async listDevices() {
      return (await allDevices()).map(mapDevice);
    },
    async getDevice(id) {
      return mapDevice(await client.getDevice(id));
    },
    async revokeDevice(id) {
      return mapDevice(
        await mutate("device:revoke", { id }, (idempotencyKey) =>
          client.revokeDevice({ deviceId: id, idempotencyKey }),
        ),
      );
    },
    async assignDevice(id, registerId) {
      return mapDevice(
        await mutate("device:assign", { id, registerId }, (idempotencyKey) =>
          client.assignDevice({ deviceId: id, registerId, idempotencyKey }),
        ),
      );
    },
    async getCommerce() {
      const [storefronts, returns, brands] = await Promise.all([
        client.listStorefrontSettings(),
        client.getReturnSettings(),
        allBrands(),
      ]);
      const storefront = storefronts.items[0];
      const mappedStorefronts = storefronts.items.map((item) => mapStorefront(item, brands));
      return {
        storefront: storefront
          ? (mappedStorefronts[0] as CommerceSettings["storefront"])
          : {
              brandId: "",
              brandName: "Not configured",
              fulfillmentInventoryLocationId: "",
              currency: "",
              codEnabled: false,
            },
        storefronts: mappedStorefronts,
        returns: mapReturns(returns),
      };
    },
    async updateCommerce(value) {
      const [storefront, returns, brands] = await Promise.all([
        mutate("storefront:upsert", value.storefront, (idempotencyKey) =>
          client.upsertStorefrontSettings({
            brandId: value.storefront.brandId,
            inventoryLocationId: value.storefront.fulfillmentInventoryLocationId,
            currency: value.storefront.currency,
            codEnabled: value.storefront.codEnabled,
            idempotencyKey,
          }),
        ),
        mutate("returns:update", value.returns, (idempotencyKey) =>
          client.updateReturnSettings({
            enabled: value.returns.enabled,
            windowDays: value.returns.windowDays,
            manualRefundsEnabled: value.returns.manualRefundsEnabled,
            maxManualRefundMinor: value.returns.maxManualRefundMinor,
            allowedReasons: value.returns.allowedReasons ?? [],
            idempotencyKey,
          }),
        ),
        allBrands(),
      ]);
      const mapped = mapStorefront(storefront, brands);
      return {
        storefront: mapped,
        storefronts: [
          ...value.storefronts.filter((item) => item.brandId !== mapped.brandId),
          mapped,
        ],
        returns: mapReturns(returns),
      };
    },
    async getReceipt(branchId) {
      const [business, branch] = await Promise.all([
        client.getBusinessSettings(),
        branchId
          ? client.getBranch(branchId)
          : allBranches().then((branches) => branches[0] ?? null),
      ]);
      return mapReceipt(business, branch);
    },
    async updateReceipt(value) {
      const business = await mutate("receipt:business", value, (idempotencyKey) =>
        client.updateBusinessSettings({
          displayName: value.businessDisplayName,
          legalName: nullIfBlank(value.legalName),
          taxIdentifier: nullIfBlank(value.taxIdentifier),
          idempotencyKey,
        }),
      );
      let branch: Branch | null = null;
      if (value.branchId) {
        branch = await mutate("receipt:branch", value, (idempotencyKey) =>
          client.updateBranch({
            branchId: value.branchId as string,
            addressLine1: nullIfBlank(value.branchAddressLine1),
            addressLine2: nullIfBlank(value.branchAddressLine2),
            city: nullIfBlank(value.branchCity),
            region: nullIfBlank(value.branchRegion),
            postalCode: nullIfBlank(value.branchPostalCode),
            countryCode: nullIfBlank(value.branchCountryCode),
            contactEmail: nullIfBlank(value.branchContactEmail),
            contactPhone: nullIfBlank(value.branchContactPhone),
            receiptFooter: nullIfBlank(value.footer),
            idempotencyKey,
          }),
        );
      }
      return mapReceipt(business, branch);
    },
    async listBrandOptions() {
      return (await allBrands()).map(option);
    },
    async listBranchOptions() {
      return (await allBranches()).map(option);
    },
    async listWarehouseOptions() {
      return (await allWarehouses()).map(option);
    },
    async listInventoryLocationOptions() {
      return (await allLocations()).map((location) => ({
        ...option(location),
        parentId: location.branchId ?? location.warehouseId ?? undefined,
        parentKind: location.branchId ? ("branch" as const) : ("warehouse" as const),
      }));
    },
    async listRegisterOptions() {
      return (await allRegisters()).map(option);
    },
  };

  adapterCache.set(client, adapter);
  return adapter;
}

function mapBusiness(dto: SdkBusinessSettings): BusinessSettings {
  return {
    id: dto.id,
    slug: dto.slug,
    displayName: dto.displayName,
    legalName: blankIfNull(dto.legalName),
    contactEmail: blankIfNull(dto.contactEmail),
    contactPhone: blankIfNull(dto.contactPhone),
    timezone: dto.defaultTimezone,
    country: blankIfNull(dto.countryCode),
    taxIdentifier: blankIfNull(dto.taxIdentifier),
    defaultCurrency: dto.defaultCurrency,
  };
}

function mapBrand(dto: Brand): BrandSettings {
  return {
    id: dto.id,
    code: dto.code,
    displayName: dto.displayName,
    legalName: blankIfNull(dto.legalName),
    status: dto.status,
  };
}

function mapBranch(dto: Branch): BranchSettings {
  const parts = [
    dto.addressLine1,
    dto.addressLine2,
    dto.city,
    dto.region,
    dto.postalCode,
    dto.countryCode,
  ].filter((part): part is string => Boolean(part));
  return {
    id: dto.id,
    code: dto.code,
    displayName: dto.displayName,
    timezone: dto.timezone,
    address: parts.join(", "),
    addressLine1: blankIfNull(dto.addressLine1),
    addressLine2: blankIfNull(dto.addressLine2),
    city: blankIfNull(dto.city),
    region: blankIfNull(dto.region),
    postalCode: blankIfNull(dto.postalCode),
    countryCode: blankIfNull(dto.countryCode),
    contactEmail: blankIfNull(dto.contactEmail),
    contactPhone: blankIfNull(dto.contactPhone),
    fulfillmentEnabled: dto.isFulfillmentEnabled,
    clickAndCollectEnabled: dto.isClickAndCollectEnabled,
    defaultInventoryLocationId: dto.defaultInventoryLocationId,
    receiptFooter: blankIfNull(dto.receiptFooter),
    eligibleBrandIds: dto.eligibleBrandIds,
    status: dto.status,
  };
}

function branchRequest(draft: Omit<BranchSettingsDraft, "code">) {
  return {
    displayName: draft.displayName,
    timezone: draft.timezone,
    addressLine1: nullIfBlank(draft.addressLine1 || draft.address),
    addressLine2: nullIfBlank(draft.addressLine2),
    city: nullIfBlank(draft.city),
    region: nullIfBlank(draft.region),
    postalCode: nullIfBlank(draft.postalCode),
    countryCode: nullIfBlank(draft.countryCode),
    contactEmail: nullIfBlank(draft.contactEmail),
    contactPhone: nullIfBlank(draft.contactPhone),
    isFulfillmentEnabled: draft.fulfillmentEnabled,
    isClickAndCollectEnabled: draft.clickAndCollectEnabled,
    defaultInventoryLocationId: draft.defaultInventoryLocationId,
    receiptFooter: nullIfBlank(draft.receiptFooter),
    status: draft.status,
  };
}

function mapWarehouse(dto: Warehouse): WarehouseSettings {
  return {
    id: dto.id,
    code: dto.code,
    displayName: dto.displayName,
    timezone: dto.timezone,
    addressLine1: blankIfNull(dto.addressLine1),
    addressLine2: blankIfNull(dto.addressLine2),
    city: blankIfNull(dto.city),
    region: blankIfNull(dto.region),
    postalCode: blankIfNull(dto.postalCode),
    countryCode: blankIfNull(dto.countryCode),
    contactEmail: blankIfNull(dto.contactEmail),
    contactPhone: blankIfNull(dto.contactPhone),
    status: dto.status,
    capabilities: {
      receiving: dto.isReceivingEnabled,
      transferOrigin: dto.isTransferOriginEnabled,
      transferDestination: dto.isTransferDestinationEnabled,
      fulfillment: dto.isFulfillmentEnabled,
    },
  };
}

function warehouseRequest(value: WarehouseSettingsDraft | WarehouseSettings) {
  return {
    displayName: value.displayName,
    timezone: value.timezone,
    addressLine1: nullIfBlank(value.addressLine1),
    addressLine2: nullIfBlank(value.addressLine2),
    city: nullIfBlank(value.city),
    region: nullIfBlank(value.region),
    postalCode: nullIfBlank(value.postalCode),
    countryCode: nullIfBlank(value.countryCode),
    contactEmail: nullIfBlank(value.contactEmail),
    contactPhone: nullIfBlank(value.contactPhone),
    isFulfillmentEnabled: value.capabilities.fulfillment,
    isReceivingEnabled: value.capabilities.receiving,
    isTransferOriginEnabled: value.capabilities.transferOrigin,
    isTransferDestinationEnabled: value.capabilities.transferDestination,
  };
}

function mapLocation(
  dto: InventoryLocation,
  branches: Map<string, string>,
  warehouses: Map<string, string>,
): InventoryLocationSettings {
  const parentKind = dto.branchId ? "branch" : "warehouse";
  const parentId = dto.branchId ?? (dto.warehouseId as string);
  return {
    id: dto.id,
    code: dto.code,
    displayName: dto.displayName,
    parentId,
    parentKind,
    parentName:
      (parentKind === "branch" ? branches.get(parentId) : warehouses.get(parentId)) ?? parentId,
    locationType: dto.locationType,
    status: dto.status,
    capabilities: {
      sellable: dto.isSellable,
      receiving: dto.isReceivingEnabled,
      transferOrigin: dto.isTransferOriginEnabled,
      transferDestination: dto.isTransferDestinationEnabled,
      fulfillment: dto.isFulfillmentEnabled,
    },
  };
}

function locationCapabilities(capabilities: InventoryLocationSettings["capabilities"]) {
  return {
    isSellable: capabilities.sellable ?? false,
    isFulfillmentEnabled: capabilities.fulfillment,
    isReceivingEnabled: capabilities.receiving,
    isTransferOriginEnabled: capabilities.transferOrigin,
    isTransferDestinationEnabled: capabilities.transferDestination,
  };
}

function mapRegister(dto: Register, branches: Map<string, string>): RegisterSettings {
  return {
    id: dto.id,
    code: dto.code,
    displayName: dto.displayName,
    branchId: dto.branchId,
    branchName: branches.get(dto.branchId) ?? dto.branchId,
    defaultInventoryLocationId: dto.defaultInventoryLocationId,
    sellingCurrency: dto.sellingCurrency,
    status: dto.status,
  };
}

function mapDevice(dto: Device): DeviceSettings {
  return {
    id: dto.id,
    installationId: dto.installationId,
    deviceType: dto.deviceType,
    displayName: dto.displayName,
    status: dto.status,
    clientVersion: dto.clientVersion,
    platform: dto.platform,
    osVersion: dto.osVersion,
    registerId: dto.currentAssignment?.registerId ?? null,
    registerName: dto.currentAssignment?.registerName ?? null,
    lastSeenAt: dto.lastSeenAt,
  };
}

function mapStorefront(
  dto: SdkStorefrontSettings,
  brands: Brand[],
): CommerceSettings["storefront"] {
  return {
    brandId: dto.brandId,
    brandName: brands.find((brand) => brand.id === dto.brandId)?.displayName ?? dto.brandId,
    fulfillmentInventoryLocationId: dto.inventoryLocationId,
    currency: dto.currency,
    codEnabled: dto.codEnabled,
  };
}

function mapReturns(dto: ReturnSettings): CommerceSettings["returns"] {
  return {
    enabled: dto.enabled,
    windowDays: dto.windowDays,
    manualRefundsEnabled: dto.manualRefundsEnabled,
    maxManualRefundMinor: dto.maxManualRefundMinor,
    allowedReasons: dto.allowedReasons,
  };
}

function mapReceipt(business: SdkBusinessSettings, branch: Branch | null): ReceiptSettings {
  return {
    businessDisplayName: business.displayName,
    legalName: blankIfNull(business.legalName),
    taxIdentifier: blankIfNull(business.taxIdentifier),
    branchId: branch?.id ?? null,
    branchAddressLine1: blankIfNull(branch?.addressLine1 ?? null),
    branchAddressLine2: blankIfNull(branch?.addressLine2 ?? null),
    branchCity: blankIfNull(branch?.city ?? null),
    branchRegion: blankIfNull(branch?.region ?? null),
    branchPostalCode: blankIfNull(branch?.postalCode ?? null),
    branchCountryCode: blankIfNull(branch?.countryCode ?? null),
    branchContactEmail: blankIfNull(branch?.contactEmail ?? null),
    branchContactPhone: blankIfNull(branch?.contactPhone ?? null),
    footer: blankIfNull(branch?.receiptFooter ?? null),
  };
}

function option(value: { id: string; displayName: string }): SettingsOption {
  return { id: value.id, label: value.displayName };
}

function blankIfNull(value: string | null) {
  return value ?? "";
}

function nullIfBlank(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
