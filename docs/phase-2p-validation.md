# Phase 2P — Admin Mobile Promotion management validation

## Contract and SDK

- Vendored `@shifted/clothing-commerce-sdk@0.12.1` from the canonical API artifact.
- SHA-256: `4fcd8076052cac6b4717b6eaa030a91f054398578cbbde9ceb69e7cfc819c7a0`.
- Optional `/me/context.access.promotions { canRead, canManage }` is read exactly and deny-by-default;
  manage does not imply read. The API remains authoritative.
- All Promotion reads and writes use SDK methods. There is no API-source import, direct HTTP, local
  permission-string parsing, database access, or duplicated SDK DTO.

## Automated coverage

The focused Promotion suite contains **34 passing tests** across capability/navigation,
list/detail, create/edit mapping, percentage/fixed benefits, automatic/code activation,
Product/Variant selection, schedule/global limits, single-use vouchers, activate/deactivate,
create/disable code, validation/permission/conflict/network mapping, pagination, derived states, and
post-redemption economics locking.

The repository-wide suite contains **464 passing tests**. The final gate runs Expo dependency
compatibility, formatting, lint, strict TypeScript, all Vitest tests, and the Expo web export. Existing
Products, Inventory, Orders/Returns, Suppliers, Staff, auth/session, and shared utilities remain in
that full suite.

## V1 boundary

Implemented: Promotion navigation; bounded list; detail; create; permitted edit fields; active/inactive
lifecycle; Product/Variant target selection from Catalog data; schedule/channel/Brand/Branch/minimum/
maximum/global-limit fields; reusable/capped/single-use codes; code disablement; redemption usage and
remaining counts; compact typed errors.

Not implemented: stacking configuration, customer-specific or first-order Promotions, per-customer
limits, bulk voucher generation, gift cards, BOGO, quantity tiers, cashier discounts, analytics,
campaign reporting, exports, generic rule builders, role/scope authoring, or any POS/Storefront change.
