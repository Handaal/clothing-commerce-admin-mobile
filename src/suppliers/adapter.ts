/**
 * The narrow Supplier integration seam — now backed by the real SDK 0.9.0 Supplier surface.
 *
 * Phase 2N shipped the Admin-Mobile UX/domain foundation against this interface; the Supplier API and
 * its SDK contract have since landed (SDK 0.9.0). {@link resolveSupplierAdapter} now returns a concrete
 * adapter that calls the tenant-scoped SDK client and maps its DTOs onto the local UI-domain model
 * ({@link ./model}). Every Supplier screen still depends only on this interface, never on the SDK —
 * so the mapping lives here once and the screens stay transport-agnostic and directly unit-testable.
 *
 * The adapter invents no endpoints and hand-writes no fetch client: the SDK owns the transport, the
 * `X-Tenant-Id` header and the `Idempotency-Key` header. It fabricates no suppliers, mutations or
 * history — a failure surfaces as a classified error, never a fake success or a silent empty list.
 */

import type {
  CreateSupplierRequest,
  Supplier as SdkSupplier,
  SupplierReceipt as SdkSupplierReceipt,
  SupplierSummary as SdkSupplierSummary,
  TenantCommerceClient,
  UpdateSupplierRequest,
} from "@shifted/clothing-commerce-sdk";

import type { CursorPage } from "../commerce/pagination";
import type {
  Supplier,
  SupplierAddress,
  SupplierDraft,
  SupplierReceipt,
  SupplierStatus,
  SupplierSummary,
} from "./model";
import type { SupplierListQuery } from "./search";

/** List responses reuse the shared cursor-page envelope so the bounded paginator applies unchanged. */
export type SupplierListPage = CursorPage<SupplierSummary>;
export type SupplierReceiptPage = CursorPage<SupplierReceipt>;

/**
 * The complete set of Supplier operations the foundation is built against. Write operations take an
 * app-supplied idempotency key, mirroring the inventory/catalog write discipline — the same key is
 * reused on an ambiguous retry so a create/update is applied at most once. The SDK owns the transport
 * and the `Idempotency-Key` header; this app never sets headers itself.
 */
export interface SupplierAdapter {
  listSuppliers(query: SupplierListQuery): Promise<SupplierListPage>;
  getSupplier(supplierId: string): Promise<Supplier>;
  createSupplier(draft: SupplierDraft, idempotencyKey: string): Promise<Supplier>;
  updateSupplier(
    supplierId: string,
    draft: SupplierDraft,
    idempotencyKey: string,
  ): Promise<Supplier>;
  setSupplierStatus(
    supplierId: string,
    status: SupplierStatus,
    idempotencyKey: string,
  ): Promise<Supplier>;
  listSupplierReceipts(
    supplierId: string,
    query: { cursor?: string },
  ): Promise<SupplierReceiptPage>;
}

// ---------------------------------------------------------------------------------------------------
// SDK DTO → local UI-domain model mapping
// ---------------------------------------------------------------------------------------------------

/** SDK optionals are `string | null`; the local model uses `undefined` for "absent". */
function orUndefined(value: string | null): string | undefined {
  return value === null ? undefined : value;
}

/**
 * The SDK carries `address` as a single free-text string (the API stores no structured address). The
 * local model's structured {@link SupplierAddress} is a UX input convenience; on read the whole
 * returned string is surfaced as `line1` so nothing is fabricated or lost. On write it is flattened
 * back to one string (see {@link flattenAddress}).
 */
function inflateAddress(address: string | null): SupplierAddress | undefined {
  const trimmed = address?.trim();
  return trimmed ? { line1: trimmed } : undefined;
}

function flattenAddress(address: SupplierAddress | undefined): string | null {
  if (!address) return null;
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.countryCode,
  ].filter((part): part is string => Boolean(part && part.trim()));
  return parts.length > 0 ? parts.join(", ") : null;
}

function mapSupplier(dto: SdkSupplier): Supplier {
  return {
    id: dto.id,
    name: dto.name,
    status: dto.status,
    referenceCode: orUndefined(dto.code),
    contactPerson: orUndefined(dto.contactPerson),
    phone: orUndefined(dto.phone),
    email: orUndefined(dto.email),
    address: inflateAddress(dto.address),
    notes: orUndefined(dto.notes),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/** The SDK list item is a compact projection (no contact fields); map what it actually returns. */
function mapSummary(dto: SdkSupplierSummary): SupplierSummary {
  return {
    id: dto.id,
    name: dto.name,
    status: dto.status,
    referenceCode: orUndefined(dto.code),
  };
}

/**
 * A supplier receipt's location is per-line in the SDK. `receiveInventory` records one variant into one
 * location, so a receipt operation is normally a single location; surface it at the receipt level only
 * when every line agrees, otherwise leave it undefined and let the lines speak for themselves. Never
 * invent a location the receipt does not unambiguously have.
 */
function receiptLocation(dto: SdkSupplierReceipt): { id?: string; name?: string } {
  const ids = new Set(dto.lines.map((line) => line.inventoryLocationId));
  if (ids.size !== 1) return {};
  const [first] = dto.lines;
  return { id: first.inventoryLocationId, name: first.inventoryLocationName };
}

function mapReceipt(dto: SdkSupplierReceipt): SupplierReceipt {
  const location = receiptLocation(dto);
  return {
    id: dto.operationId,
    receivedAt: dto.receivedAt,
    ...(location.id ? { locationId: location.id } : {}),
    ...(location.name ? { locationName: location.name } : {}),
    ...(dto.supplierReference ? { reference: dto.supplierReference } : {}),
    ...(dto.actorMembershipId ? { actor: dto.actorMembershipId } : {}),
    lines: dto.lines.map((line) => ({
      productName: line.productName,
      sku: line.sku,
      variantId: line.variantId,
      quantity: line.quantity,
    })),
  };
}

// ---------------------------------------------------------------------------------------------------
// Local model → SDK request mapping
// ---------------------------------------------------------------------------------------------------

/**
 * The `create` request has no `status` field — the API always creates an active supplier. The `code`,
 * contact and address optionals accept `null` to mean "not set"; the normalized draft has already
 * dropped empty strings, so absent optionals map straight to `null`.
 */
function toCreateRequest(draft: SupplierDraft): CreateSupplierRequest {
  return {
    name: draft.name,
    code: draft.referenceCode ?? null,
    contactPerson: draft.contactPerson ?? null,
    phone: draft.phone ?? null,
    email: draft.email ?? null,
    address: flattenAddress(draft.address),
    notes: draft.notes ?? null,
  };
}

/** The `update` request carries the full editable record plus the lifecycle `status`. */
function toUpdateRequest(draft: SupplierDraft): UpdateSupplierRequest {
  return { ...toCreateRequest(draft), status: draft.status };
}

// ---------------------------------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------------------------------

/**
 * Resolve the SDK-backed Supplier adapter for a tenant-scoped client. Always returns a concrete
 * adapter now that the Supplier API exists (the seam still permits `null` so tests and any future
 * gating can render an explicit unavailable state without touching the screens).
 */
export function resolveSupplierAdapter(client: TenantCommerceClient): SupplierAdapter | null {
  return {
    async listSuppliers(query) {
      const response = await client.listSuppliers({
        ...(query.search ? { search: query.search } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.cursor ? { cursor: query.cursor } : {}),
      });
      return { items: response.items.map(mapSummary), pageInfo: response.pageInfo };
    },

    async getSupplier(supplierId) {
      return mapSupplier(await client.getSupplier(supplierId));
    },

    async createSupplier(draft, idempotencyKey) {
      const created = await client.createSupplier({
        ...toCreateRequest(draft),
        idempotencyKey,
      });
      // The API creates suppliers active. If the operator chose "inactive" on create, honour that with
      // a follow-up lifecycle update under a derived key (each call keeps its own at-most-once key).
      if (draft.status === "inactive") {
        return mapSupplier(
          await client.updateSupplier({
            supplierId: created.id,
            status: "inactive",
            idempotencyKey: `${idempotencyKey}-status`,
          }),
        );
      }
      return mapSupplier(created);
    },

    async updateSupplier(supplierId, draft, idempotencyKey) {
      return mapSupplier(
        await client.updateSupplier({
          supplierId,
          ...toUpdateRequest(draft),
          idempotencyKey,
        }),
      );
    },

    async setSupplierStatus(supplierId, status, idempotencyKey) {
      return mapSupplier(await client.updateSupplier({ supplierId, status, idempotencyKey }));
    },

    async listSupplierReceipts(supplierId, query) {
      const response = await client.listSupplierReceipts(
        supplierId,
        query.cursor ? { cursor: query.cursor } : {},
      );
      return { items: response.items.map(mapReceipt), pageInfo: response.pageInfo };
    },
  };
}
