# Admin Mobile Engineering Rules

**Before changing code, read (in order):**

1. This file and this repo's `README.md`.
2. The API canonical platform state: `clothing-commerce-api/docs/platform/current-v1-state.md`
   (verified merged state, invariants, current SDK, deferred decisions, roadmap).
3. The current SDK README (this repo vendors `@shifted/clothing-commerce-sdk`; see `package.json` for
   the pinned version) and the relevant API domain/phase docs.

Repo-specific invariants: this is the **owner/manager management app, not the cashier** — never add
POS/checkout/retail-sale/customer-shopping functionality, and it is not a Shifted super-admin console.
**Use the versioned SDK**; never import API source or access privileged DB tables. The **server remains
authoritative for authorization** — mobile UI permissions are never authorization. Website catalog
content may be managed here, but never build a visual page-layout editor.

---

1. TypeScript strict mode and zero TypeScript errors are mandatory.
2. This is a management-only Expo application for authorized owners, administrators, and managers.
3. Never add cashier, POS checkout, retail-sale, or customer-shopping functionality.
4. The Commerce API is authoritative for business rules, identity, authorization, and data.
5. Mobile UI permissions are never authorization; the API must enforce every sensitive action.
6. Never store server secrets or directly access privileged business database tables.
7. Sensitive management actions should generally require connectivity; offline state is not global truth.
8. Use the explicitly versioned Commerce SDK and preserve supported API compatibility.
9. Do not create database schema, migrations, independent inventory, or duplicated server rules here.
10. Website catalog content may eventually be managed here, but never build a visual page-layout editor.
11. Historical (Phase 1A-R only, now satisfied): that early phase forbade adding authentication or management/business screens. Authentication and the read-only management read slice (Products, Inventory, Orders) were subsequently delivered in Phase 2F-B; this rule does not prohibit that merged work. It remains a reminder to keep new screens within the approved, in-scope phase.
12. Run Expo dependency checks, format, lint, typecheck, tests, and build for completed work.
