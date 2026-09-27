import { ApiNetworkError, type TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveSettingsAdapter } from "./adapter";

const crypto = vi.hoisted(() => ({ randomUUID: vi.fn() }));
vi.mock("expo-crypto", () => ({ randomUUID: crypto.randomUUID }));

const id = (digit: number) => `${digit}1111111-1111-4111-8111-111111111111`;
const timestamp = "2026-09-27T10:00:00.000Z";
const page = <T>(items: T[]) => ({ items, pageInfo: { nextCursor: null, hasMore: false } });

const business = {
  id: id(1),
  slug: "acme",
  normalizedSlug: "acme",
  displayName: "Acme",
  legalName: "Acme LLC",
  status: "active" as const,
  onboardingState: "complete",
  defaultLocale: "en",
  defaultTimezone: "Africa/Cairo",
  defaultCurrency: "EGP",
  countryCode: "EG",
  contactEmail: "ops@acme.example",
  contactPhone: "+20 100",
  taxIdentifier: "TAX-1",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const brand = {
  id: id(2),
  tenantId: id(1),
  code: "ACME",
  displayName: "Acme Brand",
  legalName: "Acme LLC",
  status: "active" as const,
  archivedAt: null,
  archiveReason: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const branch = {
  id: id(3),
  tenantId: id(1),
  code: "CAI",
  displayName: "Cairo",
  timezone: "Africa/Cairo",
  status: "active" as const,
  addressLine1: "1 Nile St",
  addressLine2: null,
  city: "Cairo",
  region: "Cairo",
  postalCode: null,
  countryCode: "EG",
  contactEmail: "cairo@acme.example",
  contactPhone: "+20 101",
  isFulfillmentEnabled: true,
  isClickAndCollectEnabled: true,
  defaultInventoryLocationId: id(5),
  receiptFooter: "Thank you",
  archivedAt: null,
  archiveReason: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  eligibleBrandIds: [id(2)],
};
const warehouse = {
  id: id(4),
  tenantId: id(1),
  code: "WH1",
  displayName: "Central Warehouse",
  timezone: "Africa/Cairo",
  status: "active" as const,
  addressLine1: "2 Logistics Rd",
  addressLine2: null,
  city: "Giza",
  region: "Giza",
  postalCode: null,
  countryCode: "EG",
  contactEmail: null,
  contactPhone: null,
  isFulfillmentEnabled: true,
  isReceivingEnabled: true,
  isTransferOriginEnabled: true,
  isTransferDestinationEnabled: true,
  archivedAt: null,
  archiveReason: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const branchLocation = {
  id: id(5),
  tenantId: id(1),
  branchId: id(3),
  warehouseId: null,
  code: "SHOP",
  displayName: "Shop stockroom",
  locationType: "stockroom",
  status: "active" as const,
  isSellable: true,
  isFulfillmentEnabled: true,
  isReceivingEnabled: true,
  isTransferOriginEnabled: true,
  isTransferDestinationEnabled: true,
  archivedAt: null,
  archiveReason: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const warehouseLocation = {
  ...branchLocation,
  id: id(6),
  code: "BULK",
  displayName: "Bulk storage",
  branchId: null,
  warehouseId: id(4),
};
const register = {
  id: id(7),
  tenantId: id(1),
  branchId: id(3),
  code: "REG1",
  displayName: "Front till",
  status: "active" as const,
  defaultInventoryLocationId: id(5),
  sellingCurrency: "EGP",
  archivedAt: null,
  archiveReason: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const device = {
  id: id(8),
  tenantId: id(1),
  installationId: "install-1",
  deviceType: "pos",
  displayName: "Front iPad",
  status: "active" as const,
  clientVersion: "1.2.3",
  platform: "ios",
  osVersion: "18",
  activatedAt: timestamp,
  revokedAt: null,
  revocationReason: null,
  lastSeenAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  currentAssignment: {
    assignmentId: id(9),
    registerId: id(7),
    registerName: "Front till",
    assignedAt: timestamp,
  },
};
const storefront = {
  tenantId: id(1),
  brandId: id(2),
  inventoryLocationId: id(5),
  currency: "EGP",
  codEnabled: true,
};
const returns = {
  tenantId: id(1),
  enabled: true,
  windowDays: 14,
  allowedReasons: ["wrong_size"],
  manualRefundsEnabled: true,
  maxManualRefundMinor: 50000,
};

function sdkClient(overrides: Record<string, unknown> = {}) {
  return {
    getBusinessSettings: vi.fn().mockResolvedValue(business),
    updateBusinessSettings: vi.fn().mockResolvedValue(business),
    listBrands: vi.fn().mockResolvedValue(page([brand])),
    getBrand: vi.fn().mockResolvedValue(brand),
    createBrand: vi.fn().mockResolvedValue(brand),
    updateBrand: vi.fn().mockResolvedValue(brand),
    listBranches: vi.fn().mockResolvedValue(page([branch])),
    getBranch: vi.fn().mockResolvedValue(branch),
    createBranch: vi.fn().mockResolvedValue(branch),
    updateBranch: vi.fn().mockResolvedValue(branch),
    setBranchBrands: vi.fn().mockResolvedValue(branch),
    listWarehouses: vi.fn().mockResolvedValue(page([warehouse])),
    getWarehouse: vi.fn().mockResolvedValue(warehouse),
    createWarehouse: vi.fn().mockResolvedValue(warehouse),
    updateWarehouse: vi.fn().mockResolvedValue(warehouse),
    listInventoryLocations: vi.fn().mockResolvedValue(page([branchLocation, warehouseLocation])),
    getInventoryLocation: vi.fn().mockResolvedValue(branchLocation),
    createInventoryLocation: vi.fn().mockResolvedValue(branchLocation),
    updateInventoryLocation: vi.fn().mockResolvedValue(branchLocation),
    listRegisters: vi.fn().mockResolvedValue(page([register])),
    getRegister: vi.fn().mockResolvedValue(register),
    createRegister: vi.fn().mockResolvedValue(register),
    updateRegister: vi.fn().mockResolvedValue(register),
    listDevices: vi.fn().mockResolvedValue(page([device])),
    getDevice: vi.fn().mockResolvedValue(device),
    revokeDevice: vi.fn().mockResolvedValue({ ...device, status: "revoked" }),
    assignDevice: vi.fn().mockResolvedValue(device),
    listStorefrontSettings: vi.fn().mockResolvedValue({ items: [storefront] }),
    getReturnSettings: vi.fn().mockResolvedValue(returns),
    upsertStorefrontSettings: vi.fn().mockResolvedValue(storefront),
    updateReturnSettings: vi.fn().mockResolvedValue(returns),
    ...overrides,
  } as unknown as TenantCommerceClient;
}

beforeEach(() => {
  crypto.randomUUID
    .mockReset()
    .mockReturnValueOnce("K1")
    .mockReturnValueOnce("K2")
    .mockReturnValue("K3");
});

describe("SDK 0.14.0 settings adapter", () => {
  it("maps Business read/update without sending read-only identity", async () => {
    const client = sdkClient();
    const adapter = resolveSettingsAdapter(client);
    expect(await adapter.getBusiness()).toMatchObject({ slug: "acme", timezone: "Africa/Cairo" });
    const draft = { ...(await adapter.getBusiness()) };
    await adapter.updateBusiness(draft);
    const input = vi.mocked(client.updateBusinessSettings).mock.calls[0][0];
    expect(input).toMatchObject({
      displayName: "Acme",
      defaultCurrency: "EGP",
      idempotencyKey: "K1",
    });
    expect(input).not.toHaveProperty("slug");
    expect(input).not.toHaveProperty("id");
  });

  it("binds Brand create/update/lifecycle and never sends Brand code on update", async () => {
    const client = sdkClient();
    const adapter = resolveSettingsAdapter(client);
    await adapter.createBrand({
      code: "ACME",
      displayName: "Acme",
      legalName: "",
      status: "active",
    });
    await adapter.updateBrand(id(2), {
      displayName: "Acme 2",
      legalName: "Acme",
      status: "active",
    });
    await adapter.setBrandStatus(id(2), "inactive");
    expect(vi.mocked(client.createBrand).mock.calls[0][0]).toMatchObject({ code: "ACME" });
    expect(vi.mocked(client.updateBrand).mock.calls[0][0]).not.toHaveProperty("code");
    expect(vi.mocked(client.updateBrand).mock.calls[1][0]).toMatchObject({ status: "inactive" });
  });

  it("binds Branch fields, same-Branch default-location intent, eligibility, and lifecycle", async () => {
    const client = sdkClient();
    const adapter = resolveSettingsAdapter(client);
    const value = await adapter.getBranch(id(3));
    expect(value).toMatchObject({ addressLine1: "1 Nile St", eligibleBrandIds: [id(2)] });
    await adapter.createBranch({ ...value, id: undefined } as never);
    expect(vi.mocked(client.createBranch).mock.calls[0][0]).toMatchObject({
      code: "CAI",
      addressLine1: "1 Nile St",
      defaultInventoryLocationId: id(5),
    });
    expect(vi.mocked(client.setBranchBrands)).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: id(3), brandIds: [id(2)] }),
    );
    await adapter.setBranchStatus(id(3), "inactive");
    expect(vi.mocked(client.updateBranch)).toHaveBeenLastCalledWith(
      expect.objectContaining({ branchId: id(3), status: "inactive" }),
    );
  });

  it("binds Warehouse and both InventoryLocation parent kinds without update re-parenting", async () => {
    const client = sdkClient();
    const adapter = resolveSettingsAdapter(client);
    const overview = await adapter.getInventoryOverview();
    expect(overview.locations.map((item) => [item.parentKind, item.parentName])).toEqual([
      ["branch", "Cairo"],
      ["warehouse", "Central Warehouse"],
    ]);
    await adapter.createWarehouse({ ...overview.warehouses[0] });
    await adapter.createInventoryLocation({
      code: "SHOP",
      displayName: "Shop stockroom",
      parentId: id(3),
      parentKind: "branch",
      locationType: "stockroom",
      capabilities: overview.locations[0].capabilities,
    });
    await adapter.createInventoryLocation({
      code: "BULK",
      displayName: "Bulk",
      parentId: id(4),
      parentKind: "warehouse",
      locationType: "warehouse",
      capabilities: overview.locations[1].capabilities,
    });
    expect(vi.mocked(client.createInventoryLocation).mock.calls[0][0]).toMatchObject({
      branchId: id(3),
    });
    expect(vi.mocked(client.createInventoryLocation).mock.calls[0][0]).not.toHaveProperty(
      "warehouseId",
    );
    expect(vi.mocked(client.createInventoryLocation).mock.calls[1][0]).toMatchObject({
      warehouseId: id(4),
    });
    await adapter.updateInventoryLocation(id(5), overview.locations[0]);
    const update = vi.mocked(client.updateInventoryLocation).mock.calls[0][0];
    expect(update).not.toHaveProperty("branchId");
    expect(update).not.toHaveProperty("warehouseId");
    expect(update).not.toHaveProperty("locationType");
  });

  it("binds Register create/update/lifecycle without mutable Branch or code", async () => {
    const client = sdkClient();
    const adapter = resolveSettingsAdapter(client);
    const value = (await adapter.listRegisters())[0];
    expect(value.branchName).toBe("Cairo");
    await adapter.createRegister({ ...value });
    await adapter.updateRegister(id(7), {
      displayName: value.displayName,
      defaultInventoryLocationId: value.defaultInventoryLocationId,
      sellingCurrency: value.sellingCurrency,
      status: value.status,
    });
    const update = vi.mocked(client.updateRegister).mock.calls[0][0];
    expect(update).not.toHaveProperty("branchId");
    expect(update).not.toHaveProperty("code");
    await adapter.setRegisterStatus(id(7), "inactive");
    expect(vi.mocked(client.updateRegister)).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "inactive" }),
    );
  });

  it("maps only safe Device metadata and binds revoke plus assignment", async () => {
    const client = sdkClient();
    const adapter = resolveSettingsAdapter(client);
    const mapped = (await adapter.listDevices())[0];
    expect(mapped).toMatchObject({
      installationId: "install-1",
      platform: "ios",
      registerId: id(7),
    });
    expect(mapped).not.toHaveProperty("privateKey");
    expect(mapped).not.toHaveProperty("credential");
    await adapter.revokeDevice(id(8));
    await adapter.assignDevice(id(8), id(7));
    expect(vi.mocked(client.revokeDevice)).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: id(8) }),
    );
    expect(vi.mocked(client.assignDevice)).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: id(8), registerId: id(7) }),
    );
  });

  it("binds Storefront COD, Returns, and receipt identity/footer to canonical settings", async () => {
    const client = sdkClient();
    const adapter = resolveSettingsAdapter(client);
    const commerce = await adapter.getCommerce();
    expect(commerce).toMatchObject({
      storefront: { brandName: "Acme Brand", codEnabled: true },
      returns: { windowDays: 14, allowedReasons: ["wrong_size"] },
    });
    await adapter.updateCommerce({
      ...commerce,
      storefront: { ...commerce.storefront, codEnabled: false },
    });
    expect(vi.mocked(client.upsertStorefrontSettings)).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: id(2), inventoryLocationId: id(5), codEnabled: false }),
    );
    expect(vi.mocked(client.updateReturnSettings)).toHaveBeenCalledWith(
      expect.objectContaining({ allowedReasons: ["wrong_size"], maxManualRefundMinor: 50000 }),
    );
    const receipt = await adapter.getReceipt();
    expect(receipt).toMatchObject({
      businessDisplayName: "Acme",
      branchAddressLine1: "1 Nile St",
      footer: "Thank you",
    });
    await adapter.updateReceipt(receipt);
    expect(vi.mocked(client.updateBusinessSettings)).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Acme", taxIdentifier: "TAX-1" }),
    );
    expect(vi.mocked(client.updateBranch)).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: id(3), receiptFooter: "Thank you" }),
    );
  });

  it("reuses the canonical idempotency key after an ambiguous network failure", async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new ApiNetworkError("offline"))
      .mockResolvedValueOnce(business);
    const client = sdkClient({ updateBusinessSettings: update });
    const adapter = resolveSettingsAdapter(client);
    const draft = {
      displayName: "Acme",
      legalName: "Acme LLC",
      contactEmail: "ops@acme.example",
      contactPhone: "+20 100",
      timezone: "Africa/Cairo",
      country: "EG",
      taxIdentifier: "TAX-1",
      defaultCurrency: "EGP",
    };
    await expect(adapter.updateBusiness(draft)).rejects.toBeInstanceOf(ApiNetworkError);
    await adapter.updateBusiness(draft);
    expect(update.mock.calls[0][0].idempotencyKey).toBe("K1");
    expect(update.mock.calls[1][0].idempotencyKey).toBe("K1");
  });
});
