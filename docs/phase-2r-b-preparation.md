# Phase 2R-B — Admin operational settings

Phase 2R-B is integrated against the canonical Commerce SDK **0.14.0**. The exact vendored artifact is
`vendor/shifted-clothing-commerce-sdk-0.14.0.tgz`, SHA-256
`f6a666241c135c302829d78f22e601deaffc963e102570db0ee667703b4bf69a`. The Settings screens depend on
Admin-owned view-models; `src/settings/adapter.ts` is the only SDK DTO and method boundary.

## Authorization and mutation safety

`getContext().access.settings?: { canRead, canManage }` is typed by the SDK and denied by default when
missing. The flags are independent: `canRead` exposes navigation and read surfaces, while `canManage`
exposes writes. They are UX guidance only; the API authorizes every request tenant-wide.

All writes use SDK idempotency inputs. The adapter coalesces an in-flight duplicate and retains the
same key for an ambiguous network/5xx retry; definitive rejection or success retires the key. The SDK
owns the `Idempotency-Key` header and the server owns exact replay/conflict behavior.

The client never decides whether commercial history exists. Canonical `CURRENCY_LOCKED` responses for
Tenant, Register, and Storefront currencies are shown as a concise non-bypassable restriction.
Brand/Branch/Warehouse/Register codes, InventoryLocation parent/type, and Register Branch are absent
from update requests and shown read-only after creation. Organization records use active/inactive or
archived lifecycle changes; no hard-delete operation exists.

## Operational scope

- **Business:** display/legal name, contact email/phone, timezone, country code, tax identifier, default
  currency, and read-only tenant slug/identity.
- **Brands:** paged list/detail, create, mutable names, lifecycle, and immutable code.
- **Branches:** paged list/detail, create/update, structured address/contact, timezone, fulfillment,
  click-and-collect, same-Branch default InventoryLocation, receipt footer, Brand eligibility, and
  lifecycle.
- **Warehouses:** paged list/detail, create/update, address/contact/timezone, operational capability
  flags, and lifecycle. Warehouse remains distinct from Branch.
- **InventoryLocations:** paged list/detail and creation beneath exactly one selected Branch or
  Warehouse. Parent, code, and location type are read-only after creation; capability flags and
  lifecycle remain editable. InventoryLocation remains distinct from Register.
- **Registers:** paged list/detail, create/update, selected Branch/default InventoryLocation, selling
  currency, and lifecycle. Branch and code become read-only after creation.
- **Devices:** governance-only list/detail, safe installation metadata, current Register assignment,
  reassign, and revoke. Enrollment, credential creation/rotation, offline bootstrap, and private-key
  material are never rendered or called.
- **Storefront:** Brand context, fulfillment InventoryLocation, currency, and COD only. Theme,
  deployment identity, payment-gateway, shipping-engine, and publication settings are absent.
- **Returns:** enabled, optional window, allowed reasons, manual-refund enablement, and maximum manual
  refund. The server owns integrity ceilings and stored policy snapshots; there is no return workflow.
- **Receipt identity:** Tenant display/legal name and tax id plus Branch address/contact/footer, with a
  fixed preview. There is no template or layout designer.

All cursor-backed lists follow every advertised page with the shared bounded paginator and fail closed
if the safety cap is exceeded. Reads and writes require connectivity and never substitute mock data.

## Error UX

Forbidden/session, validation (including invalid parent/default-location relationships), immutable
field, historical currency lock, lifecycle/device/idempotency conflicts, network, and server failures
map to concise operator guidance. Raw backend codes and messages never reach the screen.

## Validation and runtime boundary

Automated coverage exercises the SDK version/hash, capability guidance, read-only surfaces, every
Settings domain mapping, immutable update payloads, both InventoryLocation parent kinds, lifecycle,
Device governance, receipt identity/footer, canonical errors, and ambiguous-retry key reuse. The final
repository gate is Expo dependency check, Prettier, ESLint, strict TypeScript, focused tests, the full
suite, and Expo web export.

Authenticated acceptance must use the API repository's disposable/local fixture pattern and a real
development Clerk session. It must never target production. When that identity/runtime is unavailable,
the limitation is reported explicitly; automated transport-contract coverage is not weakened.

Phase 2S is not started here.
