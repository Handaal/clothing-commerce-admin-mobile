# Phase 2R-B — Admin operational settings preparation

Phase 2R-B prepares the Admin Mobile Settings experience while the canonical Phase 2R API and SDK
0.14.0 are being completed. It deliberately contains no guessed endpoints, wire DTOs, API source
imports, production mock transport, database access, POS selling flow, or receipt layout designer.

## Authorization and navigation

The optional future `/me/context` guidance is read defensively as
`access.settings?: { canRead, canManage }`. Missing or malformed guidance denies access.

- `canRead` shows Settings navigation and permits list/detail screens.
- `canManage` shows create, edit, lifecycle, Device revoke, and Register assignment actions.
- Read-only users retain every readable setting while management actions are hidden.
- This is presentation guidance only. The Commerce API remains authoritative for every operation.

Prepared routes:

```text
/settings
/settings/business
/settings/brands                 /settings/brands/new                 /settings/brands/[brandId]
/settings/branches               /settings/branches/new               /settings/branches/[branchId]
/settings/inventory              /settings/warehouses/[warehouseId]
                                 /settings/inventory-locations/[locationId]
/settings/registers              /settings/registers/new              /settings/registers/[registerId]
/settings/devices                /settings/devices/[deviceId]
/settings/commerce
/settings/receipt
```

The Settings home stays compact: Business, Brands, Branches, Inventory, Registers & Devices,
Commerce, and Receipt. It is not one giant form.

## Prepared UX

- **Business:** display/legal names, contact email/phone, timezone, country, tax identifier, default
  currency, and read-only tenant id/slug. Currency copy explicitly leaves history locks to the server.
- **Brands:** list/create/detail/edit and reversible lifecycle. Code becomes read-only after creation;
  there is no delete action or forced single-brand selector.
- **Branches:** list/create/detail/edit, address/contact, timezone, fulfillment, click-and-collect,
  default InventoryLocation, receipt footer, status, and lifecycle. Code becomes read-only.
- **Inventory:** Warehouse and InventoryLocation remain explicit. Detail includes editable capability
  flags and lifecycle. InventoryLocation parent and type are immutable after creation; there is no
  re-parent or location-type edit UI. Creation routes are intentionally not invented before the SDK
  confirms their canonical contracts.
- **Registers:** list/create/detail/edit, Branch, default InventoryLocation, currency, and status.
  Branch and code become read-only after creation. Server currency-history rejections get a dedicated,
  non-bypassable message.
- **Devices:** governance-only list/detail/status, current Register, assign/reassign, and revoke with
  confirmation. Device and Register are visibly distinct. Enrollment, key rotation, offline bootstrap,
  and private key material are absent.
- **Commerce:** bounded Storefront controls (context, fulfillment InventoryLocation, currency, COD)
  and Returns controls (enabled, window, manual refunds, maximum manual refund, optional reasons).
  There is no gateway setup, shipping engine, theme builder, or returns workflow.
- **Receipt:** tenant identity, Branch address/contact, receipt footer, and a small fixed-layout preview.
  There is no drag/drop, HTML editor, or arbitrary block system.

Referenced commercial entities use Deactivate/Reactivate or Archive semantics, never hard delete.
Loading, empty, classified error, access-denied, read-only, and explicit SDK-pending states are shared.

## Adapter boundary

`src/settings/adapter.ts` is the only future transport boundary. Components consume Admin-owned
view-models from `src/settings/model.ts`; routes resolve a nullable adapter. In SDK 0.13.1 production,
the resolver returns `null`, so a read-authorized route says exactly:

> Canonical transport binding pending SDK 0.14.0.

It does not fabricate data or make hand-written HTTP requests. Tests inject a local view-model adapter
only to exercise Admin-owned behavior.

Presentation maps forbidden, validation, immutable-field, historical-lock, conflict, network, and
server failures to concise messages. Raw backend codes never reach the screen.

## Exact SDK 0.14.0 transport work remaining

After the canonical artifact lands:

1. Vendor the deterministic SDK 0.14.0 tarball and update the exact `package.json`/lockfile pin.
2. Replace the defensive `unknown` capability read with the SDK-typed `access.settings` field.
3. Implement `resolveSettingsAdapter` using only canonical tenant-client methods and DTOs.
4. Map every SDK response/request at the adapter boundary; adjust Admin view-models only where the
   canonical contract requires it. Do not leak SDK DTOs into screens.
5. Confirm canonical pagination, query/filter fields, idempotency requirements, lifecycle enums,
   Warehouse/InventoryLocation creation support, Branch Brand eligibility, allowed return reasons,
   and receipt settings ownership before exposing any contract-dependent control.
6. Route server field validation into local field presentation where the SDK supplies locations.
7. Preserve exact retry/idempotency semantics for every settings mutation and refresh authoritative
   server state after success.
8. Add adapter mapping tests against real SDK 0.14.0 DTO fixtures, SDK artifact integrity checks, and
   authenticated runtime acceptance for read-only and managing identities.

Until those steps are complete, this branch is a preparation shell and is not a merge-ready transport
integration.
