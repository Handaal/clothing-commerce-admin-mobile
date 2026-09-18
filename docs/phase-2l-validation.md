# Phase 2L Admin Mobile online order visibility

Starting clean main: `c1188f77a65a54d209de227368cc48a3bbdf8450` (merged catalog PR #7).
Branch: `phase/2l-admin-online-orders`.

## SDK and compatibility

Upgraded the committed relative tarball dependency from 0.6.0 to **0.7.0**. Verified the supplied
artifact before copying/consuming it:

`ff94c5d34e23775afbd1ebc9180c40030d1161ca9f2c3efbf72fac5bed70c70a`

The runtime version, dependency path and SHA-256 remain asserted by `src/sdk-artifact.test.ts`.
Early regression, before feature changes: strict TypeScript and **212 tests / 28 files passed**.
The obsolete 0.6.0 tarball is removed. No SDK source or API source is imported into this application.

## Behavior and contract limits

- Existing bounded Orders pagination and navigation are preserved. All/POS/Online uses the SDK's
  channel query on every page. Rows show uppercase channel badges; refresh retains the filter.
- Detail adds historical customer/contact and delivery snapshots, exact payment state/method and
  amount/currency, and per-reservation operational state/quantities. Optional address fields and
  provider/expiry appear only when supplied. Missing snapshots/payment/reservations remain explicit.
- `placedAt` is the supplied timestamp. There is no separate creation timestamp to reconstruct.
- Pending COD stays pending even when the API reports complete fulfillment. Reservation status is
  taken from the server; neither clock time nor quantity arithmetic changes it locally.
- The existing fulfillment surface was read-only, and SDK 0.7.0 has no management fulfillment
  operation. Overall and per-line progress are preserved without introducing a new fulfillment flow.
- Refresh replaces old detail with loading and then the authoritative result or classified error.
  404, authorization denial, session, network and unsupported response errors stay distinct.

## Real runtime acceptance

Executed on **2026-09-18**, against API commit
`ea06c99571f3ac0707b13512aa24628eebeafeef`, using its existing disposable local Supabase/PostgreSQL
and real Next.js HTTP runner (`scripts/test-online-commerce.mjs`). No API repository source was edited.

The API-owned runner provisioned its existing checkout fixture and locally signed session, verified
by the real Clerk backend verifier. Its **18 integration tests passed**, including placement,
management reads, snapshots, payment transitions, reservation lifecycle, partial/full canonical
fulfillment, rollback, isolation and concurrency.

A temporary orchestration wrapper outside both repositories extended the runner before teardown:

1. Ran the unchanged API integration suite to establish fulfilled ONLINE orders.
2. Created one POS fixture through the API SDK's real sale operation in that disposable environment.
3. Ran this repository's `pnpm test:runtime` with only the loopback API URL and test session supplied.
   No server credential or direct database access is used by the mobile acceptance suite.

**3 mobile runtime tests passed**, using the vendored SDK, real HTTP and the actual React Native Web
list/detail components under jsdom:

- Created a real ONLINE order through checkout, bootstrapped authenticated management access, saw
  its ONLINE list badge, filtered to Online and opened detail. Verified contact, recipient, address,
  notes, pending COD, reserved stock, unfulfilled progress and refresh.
- Opened an ONLINE order fulfilled by the API's canonical operation: `3 / 3 fulfilled`, consumed
  reservation, and payment still pending.
- Filtered to POS and opened the real POS order: captured cash and fulfilled progress remained correct.

These are automated component/API acceptance tests, not an interactive device or Clerk sign-in
walkthrough. Only the device auth adapter and tenant storage are substituted; business responses,
SDK calls and API authorization are real. The runner stopped its API/containers afterwards.

To repeat the mobile suite with the API-owned disposable environment held open after the steps above:

```powershell
# Supply ONLINE_TEST_URL (loopback) and ONLINE_TEST_TOKEN from the API's disposable runner.
# Do not print, persist or commit the token. Do not target production.
pnpm.cmd test:runtime
```

The suite deliberately fails if the API/session, existing fulfilled ONLINE order or POS fixture is
absent. It does not silently skip or replace them with mocks. Checkout in this acceptance file is
fixture setup only; no checkout or POS action is added to the application.

## Validation gates

Final results: frozen install, Expo dependency check, formatting/check, ESLint, strict TypeScript,
**230 tests / 28 files**, production Expo web export (**9 routes**) and `git diff --check` passed.
The full suite covers auth/bootstrap, catalog management, inventory receive/adjust/transfer, POS
Orders and existing fulfillment. The focused Orders subset passed **47 tests / 4 files**.
The separate real-runtime results are **3 mobile tests** plus **18 API integration tests** above.

Commands:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd exec expo install --check
pnpm.cmd format
pnpm.cmd format:check
pnpm.cmd lint
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd build
pnpm.cmd test:runtime # with the prepared real environment described above
git diff --check
```

## Merge dependency

[API Phase 2L PR #20](https://github.com/Handaal/clothing-commerce-api/pull/20) was still open at
validation time. Do not merge the mobile PR until that API phase merges and SDK 0.7.0 is final.
