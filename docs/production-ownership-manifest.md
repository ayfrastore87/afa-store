# AFA Store — Production Ownership Manifest

**Status:** **INCOMPLETE**

This document distinguishes lifecycle responsibility from PostgreSQL `relowner`/`proowner`. Catalog owners for public objects remain unknown, so no existing public object is finally classified as application-owned yet.

| Object/scope | Classification | Baseline treatment | Evidence gap |
|---|---|---|---|
| `auth.users` | SUPABASE-MANAGED | Never create, alter, drop, or claim | None for lifecycle classification |
| `public.users(auth_id) → auth.users(id)` | CROSS-SCHEMA DEPENDENCY | Preserve public-side FK after exact review; exclude target DDL | `ON UPDATE`, owner, full definition |
| `storage.*` | SUPABASE-MANAGED | Exclude from application baseline | Public dependencies unknown |
| `extensions.*` and extension-owned objects | SUPABASE-MANAGED | Exclude from application baseline | Installed extensions/dependencies unknown |
| Other Supabase-managed schemas | SUPABASE-MANAGED | Exclude unless documenting an external dependency | Complete dependency graph unknown |
| 17 model-backed existing `public` tables | UNKNOWN | Preserve; do not generate DDL yet | Owners and complete definitions unknown |
| `public.parcel_packages` | UNKNOWN | Preserve; intentionally not inferred from Prisma | Owner and complete definition unknown |
| `public.stock_history` | UNKNOWN | Preserve; intentionally not inferred from Prisma | Owner and complete definition unknown |
| `public.update_updated_at_column()` | UNKNOWN | Preserve pending owner/dependency review | Function owner/ACL metadata unknown |
| Parcel update trigger | UNKNOWN | Preserve with its table pending review | Table owner and exact trigger metadata unknown |
| `public."CheckoutIdempotency"` | FUTURE APPLICATION OBJECT | Excluded from baseline | Absent from Production by design |

## Approval rule

An object may be labeled `APPLICATION-OWNED` only after its Production definition, PostgreSQL owner, dependencies, and operational lifecycle have been reviewed. Location in `public`, presence in Prisma, or presence in a historical migration is not sufficient evidence.

## Managed-object boundary

The future application baseline may reference an already-existing managed object only where an evidenced public-side dependency requires it. Such a reference does not transfer ownership. In particular, the baseline must not contain DDL that creates `auth.users` or any Supabase-managed schema.