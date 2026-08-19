# Admin Mobile Architecture

```text
Expo management UI -> versioned SDK over HTTPS -> Commerce API -> authoritative commerce core
```

The app is exclusively a management channel. Future identity and UI permissions support usability,
but the API performs authoritative authorization, tenant isolation, validation, and business rules.
Sensitive actions should generally require connectivity.

This repository has no POS flow, hardware integration, independent inventory, Supabase directory,
database migration ownership, or privileged database credential.
