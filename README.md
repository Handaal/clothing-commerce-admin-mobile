# Clothing Commerce Admin Mobile

Expo/React Native management-channel shell for authorized owners and managers. Phase 1A-R displays
`Admin Management — Foundation Ready` and Commerce API connectivity only.

## Boundaries and ownership

This repository owns the management mobile UI and its future mobile release lifecycle. It is not a
POS, cashier app, retail-sale channel, customer-shopping app, or website layout builder. It owns no
business rules, authoritative inventory, privileged database access, Supabase schema/migrations, or
server secrets. The Commerce API will authorize all future sensitive management operations;
client-side permissions are not authoritative.

## Technology

Expo, React Native, Expo Router, TypeScript, Zod-backed packaged SDK, Vitest, ESLint, Prettier, and
pnpm.

## Install and develop

Requirements: Node.js 24+, pnpm 10.33.1, Git, and an Expo-supported device/emulator.

```bash
pnpm install --frozen-lockfile
pnpm exec expo install --check
cp .env.example .env
pnpm dev
```

Set `EXPO_PUBLIC_COMMERCE_API_URL` to the API address reachable by the device. It is embedded in the
app and must never contain service-role, authentication, payment, webhook, or other server secrets.

## SDK and API connection

The app consumes `@shifted/clothing-commerce-sdk` 0.1.0 and sends `admin-mobile` client metadata.
During private-registry bootstrap, the exact packed SDK is committed under `vendor/` and locked so
the repository builds without sibling checkouts. Future upgrades use explicit private-registry
versions independently.

## Quality, build, and release

```bash
pnpm exec expo install --check
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Future releases are this repository's responsibility: Git → EAS Build → Android/iOS distribution.
No EAS submission or deployment exists now. Current scope is Phase 1A-R only.
