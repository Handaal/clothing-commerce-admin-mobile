# Phase 2Q-B — Admin reporting JSON integration

## Status and boundary

The Admin-owned reporting experience is connected to the canonical JSON reporting API through
`@shifted/clothing-commerce-sdk@0.13.0`. `resolveReportingAdapter` maps the seven SDK methods into
Admin-owned view models. There is no direct HTTP, guessed endpoint, copied API type, API-source import,
fake production data, or CSV transport.

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

## SDK and remaining export boundary

The vendored 0.13.0 artifact SHA-256 is
`a141fb881752b64625bc1519b92fcf4f7aafd6c83eb81f0eb9b737fec2fb5e90` and is guarded by a test.

The completed integration passes Expo dependency compatibility, Prettier, ESLint, strict TypeScript,
the full unit/component suite, and the 28-route Expo web export.

CSV controls remain disabled for Product/Variant sales, Inventory movements, Returns/refunds, and
Supplier receipt history. The only remaining Phase 2Q-B work is to vendor SDK 0.13.1 and bind its
canonical export methods without inventing URLs, filenames, response types, or download behavior.
