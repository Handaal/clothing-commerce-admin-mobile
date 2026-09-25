# Phase 2Q-B — Admin reporting UI preparation

## Status and boundary

The Admin-owned reporting experience is prepared and testable, but it does not call a reporting API.
The repository remains pinned to `@shifted/clothing-commerce-sdk@0.12.1`, which has no reporting types or
methods. **Transport binding pending SDK 0.13.0.** `resolveReportingAdapter` returns `null`; there is no
direct HTTP, guessed endpoint, copied API type, API-source import, fake production data, or CSV transport.

The app is still the owner/manager management channel. This work adds no cashier/POS reporting app and no
Storefront reporting surface. References to POS in Sales are read-only channel breakdowns, with branch
data labelled **POS sales by branch** so online sales are never implied to belong to a branch.

## Prepared routes and access

- `/reports`
- `/reports/sales`
- `/reports/products`
- `/reports/inventory`
- `/reports/returns`
- `/reports/promotions`
- `/reports/suppliers`

`reportingCapabilities` isolates the future optional `access.reports?.canRead` field. Only literal `true`
shows navigation; missing or malformed guidance denies by default. This is UX guidance only. SDK/API
authorization remains authoritative once transport is connected.

## Presentation model

`src/reporting/model.ts` contains normalized Admin view-models rather than wire DTOs. The dashboard
prepares Gross, Discounts, Net, Orders, AOV, separately presented Returns/refunds, one accessible sales
trend bucket table, POS/Online and Brand breakdowns, top Products, and current inventory exceptions.

The detailed screens prepare:

- Sales: trend, channel, Brand, POS Branch, POS Register, and POS Operator.
- Products: Product/Variant ranking, units, gross/discount/net, and “No sales in period with current
  stock.”
- Inventory: current balances plus paged movements, receipts, transfers, and adjustments using explicit
  `InventoryLocation` terminology.
- Returns: accepted returned value, succeeded refunded value, pending refunds, count, disposition, and
  paged returned Product/Variant ranking. No return-rate KPI exists.
- Promotions: Promotion, redemptions, discount, associated Orders, gross and net per currency. No ROI or
  profitability exists.
- Suppliers: receipt count, units received, and last receipt only. No supplier spend/value exists.

## Currency, time, states, and paging

Every monetary group/row carries its currency. Multiple currencies render as separate groups; the selector
appears only with multiple currencies and defaults to “All currencies (shown separately),” never silently
choosing one. No cross-currency total is calculated.

Date presets are Today, 7 days, 30 days, and Custom. Custom values are validated as ordered `YYYY-MM-DD`
tenant-local calendar dates. The client performs no timezone/business-day conversion. Each result displays
the server-supplied timezone, `fromInclusive`, and `toExclusive`; trend rows display supplied bucket
boundaries.

Every screen has loading, empty, classified concise error, access-denied, explicit refresh, and pending
transport behavior. Product ranking, returned Products, Promotions, Suppliers, and Inventory movements use
one-page-at-a-time cursor controls; no client downloads and aggregates all history.

Disabled CSV affordances are reserved only for Product/Variant sales, Inventory movements,
Returns/refunds, and Supplier receipt history. There is no dashboard, Promotion, PDF, or XLSX export.

## Validation evidence

The clean `origin/main` baseline passed with 66 test files / 464 tests and a 21-route web export.
After this preparation work, the reporting-focused suite passes 18 tests and the repository-wide suite
passes 71 test files / 482 tests. Expo dependency compatibility, Prettier check, ESLint, strict
TypeScript, and the Expo web export all pass; the export includes all 28 routes (the original 21 plus
the seven Reporting routes).

## Integration checklist for SDK 0.13.0

1. Vendor and verify the canonical packed artifact; update the SDK artifact guard.
2. Replace only `resolveReportingAdapter` with SDK-backed DTO-to-view-model mappings.
3. Replace the narrow capability seam cast with the SDK's typed `access.reports` field.
4. Confirm each SDK operation preserves service-supplied currency/time/page semantics and maps 403 to the
   existing access-denied state.
5. Add adapter contract tests against real SDK 0.13.0 DTO fixtures and live API acceptance.
6. Enable only exports present in the canonical contract; keep all others absent.
