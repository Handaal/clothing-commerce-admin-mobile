import type { TenantCommerceClient } from "@shifted/clothing-commerce-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  INVENTORY_LOCATION_A,
  INVENTORY_LOCATION_B,
  MEMBERSHIP_A,
  SUPPLIER_A,
  SUPPLIER_RECEIPT_A,
  VARIANT_A,
  sdkSupplier,
  sdkSupplierListResponse,
  sdkSupplierReceipt,
  sdkSupplierReceiptsResponse,
  sdkSupplierSummary,
} from "../test-support/fixtures";
import { resolveSupplierAdapter } from "./adapter";
import type { SupplierDraft } from "./model";

/** Minimal tenant-client stub carrying only the supplier methods the adapter uses. */
function clientWith(overrides: Partial<TenantCommerceClient>): TenantCommerceClient {
  return overrides as TenantCommerceClient;
}

const NARROW_DRAFT: SupplierDraft = {
  name: "Nile Textiles Co.",
  referenceCode: "SUP-001",
  contactPerson: "Mona Adel",
  phone: "+20 10 1234 5678",
  email: "orders@niletextiles.example",
  address: "12 Corniche El Nil, Cairo",
  notes: "Primary linen supplier.",
  status: "active",
};

describe("resolveSupplierAdapter — SDK 0.9.0 mapping", () => {
  it("maps the list response and passes search/status/cursor through as the server query", async () => {
    const listSuppliers = vi.fn().mockResolvedValue(
      sdkSupplierListResponse([sdkSupplierSummary({ code: null })], {
        nextCursor: "c2",
        hasMore: true,
      }),
    );
    const adapter = resolveSupplierAdapter(clientWith({ listSuppliers }))!;

    const page = await adapter.listSuppliers({ search: "nile", status: "active", cursor: "c1" });

    // The query round-trips to the server (never a client-side filter).
    expect(listSuppliers).toHaveBeenCalledWith({ search: "nile", status: "active", cursor: "c1" });
    // DTO → local summary: `code` becomes `referenceCode`, null becomes undefined.
    expect(page.items[0]).toEqual({
      id: SUPPLIER_A,
      name: "Nile Textiles Co.",
      status: "active",
      referenceCode: undefined,
    });
    // The cursor envelope is preserved for the bounded paginator.
    expect(page.pageInfo).toEqual({ nextCursor: "c2", hasMore: true });
  });

  it("omits non-constraining query members entirely", async () => {
    const listSuppliers = vi.fn().mockResolvedValue(sdkSupplierListResponse([]));
    const adapter = resolveSupplierAdapter(clientWith({ listSuppliers }))!;

    await adapter.listSuppliers({});

    expect(listSuppliers).toHaveBeenCalledWith({});
  });

  it("maps a full supplier, converting SDK nulls to undefined and passing the address through", async () => {
    const getSupplier = vi.fn().mockResolvedValue(sdkSupplier());
    const adapter = resolveSupplierAdapter(clientWith({ getSupplier }))!;

    const supplier = await adapter.getSupplier(SUPPLIER_A);

    expect(getSupplier).toHaveBeenCalledWith(SUPPLIER_A);
    expect(supplier).toEqual({
      id: SUPPLIER_A,
      name: "Nile Textiles Co.",
      status: "active",
      referenceCode: "SUP-001",
      contactPerson: "Mona Adel",
      phone: "+20 10 1234 5678",
      email: "orders@niletextiles.example",
      address: "12 Corniche El Nil, Cairo",
      notes: "Primary linen supplier.",
      createdAt: "2026-08-01T09:00:00.000Z",
      updatedAt: "2026-09-10T09:00:00.000Z",
    });
  });

  it("maps null optionals (code/contact/address/notes) to undefined and drops the address", async () => {
    const getSupplier = vi.fn().mockResolvedValue(
      sdkSupplier({
        code: null,
        contactPerson: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
      }),
    );
    const adapter = resolveSupplierAdapter(clientWith({ getSupplier }))!;

    const supplier = await adapter.getSupplier(SUPPLIER_A);

    expect(supplier.referenceCode).toBeUndefined();
    expect(supplier.contactPerson).toBeUndefined();
    expect(supplier.address).toBeUndefined();
    expect(supplier.notes).toBeUndefined();
  });

  it("maps a create draft to the SDK request (referenceCode → code, address passed through)", async () => {
    const created = sdkSupplier();
    const createSupplier = vi.fn().mockResolvedValue(created);
    const adapter = resolveSupplierAdapter(clientWith({ createSupplier }))!;

    await adapter.createSupplier(NARROW_DRAFT, "K1");

    expect(createSupplier).toHaveBeenCalledWith({
      name: "Nile Textiles Co.",
      code: "SUP-001",
      contactPerson: "Mona Adel",
      phone: "+20 10 1234 5678",
      email: "orders@niletextiles.example",
      address: "12 Corniche El Nil, Cairo",
      notes: "Primary linen supplier.",
      idempotencyKey: "K1",
    });
    // The create request never carries `status` — the API creates suppliers active.
    expect(createSupplier.mock.calls[0][0]).not.toHaveProperty("status");
  });

  it("honours an inactive choice on create via a follow-up status update under a derived key", async () => {
    const createSupplier = vi.fn().mockResolvedValue(sdkSupplier({ status: "active" }));
    const updateSupplier = vi.fn().mockResolvedValue(sdkSupplier({ status: "inactive" }));
    const adapter = resolveSupplierAdapter(clientWith({ createSupplier, updateSupplier }))!;

    const result = await adapter.createSupplier({ ...NARROW_DRAFT, status: "inactive" }, "K1");

    expect(createSupplier).toHaveBeenCalledTimes(1);
    expect(updateSupplier).toHaveBeenCalledWith({
      supplierId: SUPPLIER_A,
      status: "inactive",
      idempotencyKey: "K1-status",
    });
    expect(result.status).toBe("inactive");
  });

  it("maps an update draft to the SDK request including the lifecycle status", async () => {
    const updateSupplier = vi.fn().mockResolvedValue(sdkSupplier());
    const adapter = resolveSupplierAdapter(clientWith({ updateSupplier }))!;

    await adapter.updateSupplier(SUPPLIER_A, { ...NARROW_DRAFT, status: "inactive" }, "K2");

    expect(updateSupplier).toHaveBeenCalledWith({
      supplierId: SUPPLIER_A,
      name: "Nile Textiles Co.",
      code: "SUP-001",
      contactPerson: "Mona Adel",
      phone: "+20 10 1234 5678",
      email: "orders@niletextiles.example",
      address: "12 Corniche El Nil, Cairo",
      notes: "Primary linen supplier.",
      status: "inactive",
      idempotencyKey: "K2",
    });
  });

  it("sends null for absent optionals so a cleared field is explicitly unset", async () => {
    const createSupplier = vi.fn().mockResolvedValue(sdkSupplier());
    const adapter = resolveSupplierAdapter(clientWith({ createSupplier }))!;

    await adapter.createSupplier({ name: "Bare Co.", status: "active" }, "K3");

    expect(createSupplier).toHaveBeenCalledWith({
      name: "Bare Co.",
      code: null,
      contactPerson: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      idempotencyKey: "K3",
    });
  });

  it("maps a status change to an updateSupplier call", async () => {
    const updateSupplier = vi.fn().mockResolvedValue(sdkSupplier({ status: "inactive" }));
    const adapter = resolveSupplierAdapter(clientWith({ updateSupplier }))!;

    const result = await adapter.setSupplierStatus(SUPPLIER_A, "inactive", "K4");

    expect(updateSupplier).toHaveBeenCalledWith({
      supplierId: SUPPLIER_A,
      status: "inactive",
      idempotencyKey: "K4",
    });
    expect(result.status).toBe("inactive");
  });

  it("maps receiving history: operationId → id, per-line location surfaced when unambiguous", async () => {
    const listSupplierReceipts = vi.fn().mockResolvedValue(sdkSupplierReceiptsResponse());
    const adapter = resolveSupplierAdapter(clientWith({ listSupplierReceipts }))!;

    const page = await adapter.listSupplierReceipts(SUPPLIER_A, { cursor: "rc1" });

    expect(listSupplierReceipts).toHaveBeenCalledWith(SUPPLIER_A, { cursor: "rc1" });
    expect(page.items[0]).toEqual({
      id: SUPPLIER_RECEIPT_A,
      receivedAt: "2026-09-12T10:00:00.000Z",
      locationId: INVENTORY_LOCATION_A,
      locationName: "Flagship Stockroom",
      reference: "GRN-2026-0012",
      actor: MEMBERSHIP_A,
      lines: [{ productName: "Linen Shirt", sku: "LS-001-M", variantId: VARIANT_A, quantity: 20 }],
    });
  });

  it("leaves the receipt-level location undefined when lines span multiple locations", async () => {
    const receipt = sdkSupplierReceipt({
      lines: [
        {
          variantId: VARIANT_A,
          sku: "LS-001-M",
          productName: "Linen Shirt",
          quantity: 10,
          inventoryLocationId: INVENTORY_LOCATION_A,
          inventoryLocationName: "Flagship Stockroom",
          branchId: null,
        },
        {
          variantId: VARIANT_A,
          sku: "LS-001-M",
          productName: "Linen Shirt",
          quantity: 5,
          inventoryLocationId: INVENTORY_LOCATION_B,
          inventoryLocationName: "Overflow Stockroom",
          branchId: null,
        },
      ],
    });
    const listSupplierReceipts = vi.fn().mockResolvedValue(sdkSupplierReceiptsResponse([receipt]));
    const adapter = resolveSupplierAdapter(clientWith({ listSupplierReceipts }))!;

    const page = await adapter.listSupplierReceipts(SUPPLIER_A, {});

    expect(page.items[0].locationId).toBeUndefined();
    expect(page.items[0].locationName).toBeUndefined();
    expect(page.items[0].lines).toHaveLength(2);
  });

  it("maps a legacy receipt without a supplier reference (null → omitted)", async () => {
    const receipt = sdkSupplierReceipt({ supplierReference: null, actorMembershipId: null });
    const listSupplierReceipts = vi.fn().mockResolvedValue(sdkSupplierReceiptsResponse([receipt]));
    const adapter = resolveSupplierAdapter(clientWith({ listSupplierReceipts }))!;

    const page = await adapter.listSupplierReceipts(SUPPLIER_A, {});

    expect(page.items[0].reference).toBeUndefined();
    expect(page.items[0].actor).toBeUndefined();
  });
});
