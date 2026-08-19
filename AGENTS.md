# Admin Mobile Engineering Rules

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
11. Do not add authentication or management/business screens in Phase 1A-R.
12. Run Expo dependency checks, format, lint, typecheck, tests, and build for completed work.
