# Phase 2Q — Admin reporting and CSV export

## Status and boundary

The Admin-owned reporting experience is connected to the canonical reporting API through
`@shifted/clothing-commerce-sdk@0.13.1`. `resolveReportingAdapter` maps the seven JSON methods and the
bounded `exportReport` document method into Admin-owned view models. There is no direct HTTP, guessed
endpoint, copied API type, API-source import, fake production data, or client-side CSV generation.

The app remains the owner/manager management channel. This adds no cashier/POS reporting app and no
Storefront reporting surface. References to POS in Sales are read-only channel breakdowns, with branch
data labelled **POS sales by branch** so online sales are never implied to belong to a branch.

## Routes and access

- `/reports`
- `/reports/sales`
- `/reports/products`
- `/reports/inventory`
- `/reports/returns`
- `/reports/promotions`
- `/reports/suppliers`

`reportingCapabilities` reads the SDK-typed optional `access.reports?.canRead` field. Only literal `true`
shows navigation; missing guidance denies by default. This is UX guidance only. The API authorizes every
report request.

## Canonical SDK mapping

`src/reporting/model.ts` contains normalized Admin view-models rather than wire DTOs. The single adapter
binds `getReportSummary`, `getSalesReport`, `getProductsReport`, `getInventoryReport`,
`getReturnsReport`, `getPromotionsReport`, and `getSuppliersReport`.

- Dashboard: Gross, Discounts, Net, Orders, nullable AOV, separately presented Returns/refunds, current
  stock summary, trend, POS/Online, Brand, top Products, and no-sales-with-current-stock rows.
- Sales: trend, channel, Brand, POS Branch, POS Register, and POS Operator.
- Products: Product/Variant sales and `no_sales_with_current_stock`; no low-stock threshold or
  slow-moving score is invented.
- Inventory: current balances plus movements, receipts, transfers, and adjustments. Aggregate operation
  views render only their canonical operation fields and do not fabricate a Product or location.
- Returns: accepted return value, succeeded/pending refunds, count, summary-level disposition, and paged
  Product/Variant results. No return-rate KPI exists.
- Promotions: redemption count, discount, associated/cancelled Orders, gross and net per currency. No ROI
  or profitability exists.
- Suppliers: canonical current/snapshot label, receipt count, units received, and last receipt only. No
  spend/value exists.

## Currency, time, errors, and paging

Every monetary group/row retains its server currency. Multiple currencies render as separate groups and
are never added together.

Date presets resolve to `startDate`/`endDate` calendar strings; Custom accepts ordered `YYYY-MM-DD`
values. The client performs no UTC conversion. Results display server-supplied `timezone`,
`fromInclusive`, `toExclusive`, `inventoryAsOf`, and trend `bucketStart` fields exactly where the SDK
exposes them.

Forbidden, authentication, network, contract, server, and validation/cursor errors map to concise Admin
states without rendering raw backend codes. Product, Inventory, Returns, and Supplier controls pass only
the current opaque SDK cursor and never download all pages. Promotions are not paged in SDK 0.13.0 and
therefore expose no invented page control.

## Canonical CSV exports

Exactly four export actions call SDK `exportReport` with the screen's current tenant-local
`startDate`/`endDate`:

- Products: `sales-products`, preserving the selected Product or Variant `level`.
- Inventory: `inventory-movements` only; current balances, valuation, and costs are never exported.
- Returns: `returns`; Return/refund semantics and rows remain server-owned.
- Suppliers: `supplier-receipts`; no spend, acquisition value, COGS, or cost exists.

There is no Dashboard export, Promotion export, PDF, XLSX, generic export builder, or arbitrary dataset
selection. The SDK response `{ body, mediaType, filename }` is passed unchanged to one small platform
boundary: web creates a direct Blob download; native writes the body under the canonical filename in
Expo cache and opens the Expo share sheet with the canonical media type. The Admin app never parses,
normalizes, quotes, truncates, or rebuilds CSV content.

Exports expose idle, exporting, success, and failure states and ignore duplicate taps while active.
`EXPORT_RANGE_TOO_LARGE` asks the operator to shorten the selected range;
`EXPORT_TOO_MANY_ROWS` asks them to narrow the date range or filters. Authentication, forbidden,
invalid request/level, network, contract, and server failures are mapped without showing raw backend
codes. Dates are never silently shortened, rows are never silently truncated, and no smaller-range
retry is automatic.

## SDK boundary

The vendored 0.13.1 artifact SHA-256 is
`287129cb2f6a49b4ff0701e89a1118169afa51f61ab681b61f745a06547fac5c` and is guarded by a test.
