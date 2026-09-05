# AFA STORE — Production Schema Inventory

**Evidence date:** 2026-09-06
**Evidence status:** **BASELINE EVIDENCE — BLOCKED**
**Policy:** only approved metadata-only Production evidence may establish observed Production values. Local Prisma/SQL artifacts are historical or intended state, never substitutes for Production evidence.

No Supabase dashboard metadata export, approved SQL Editor metadata result, or approved read-only metadata-tool output was supplied for FASE 2.36. No database was contacted, no business rows or PII were read, and `prisma db pull` was not used. Consequently, exact Production object membership and all object details remain `UNKNOWN`.

## Evidence ledger

| OBJECT | SOURCE | OBSERVED VALUE | CONFIDENCE | DATE | NOTES |
|---|---|---|---|---|---|
| `public` tables (complete set) | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Prior supplied summary says 19 tables, but no approved object list/export was supplied. |
| `public.users` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only; not Production evidence. |
| `public.addresses` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.categories` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.products` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.wishlists` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.cart_items` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.orders` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Status defaults specifically remain unverified. |
| `public.payments` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.order_items` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.vouchers` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.user_vouchers` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.checkout_histories` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.password_reset_tokens` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.testimonials` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.banners` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.promotions` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.settings` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Candidate from local artifacts only. |
| `public.stock_history` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Ownership and existence remain UNKNOWN. |
| Any additional `public` table | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Complete set cannot be inferred from Prisma. |
| All columns/types/nullability/defaults | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | No assumptions from `prisma/schema.prisma`. |
| All PK/FK/unique/check/exclusion constraints | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | FK actions also UNKNOWN. |
| All indexes | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Definitions, predicates, and expressions UNKNOWN. |
| All triggers | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Definitions and enabled state UNKNOWN. |
| All functions/procedures | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Definitions, security mode, and dependencies UNKNOWN. |
| All views/materialized views | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Definitions and dependencies UNKNOWN. |
| All sequences | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Ownership and bindings UNKNOWN. |
| All enum/type/domain objects | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Definitions and dependencies UNKNOWN. |
| Cross-schema dependencies (complete set) | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Must be exported without business rows. |
| `public.users.auth_id -> auth.users.id` | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Required relationship is stated but unverified. `auth.users` remains external. |
| `public._prisma_migrations` existence | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Prior summary states absent; not independently observed. |
| `public."CheckoutIdempotency"` existence | Approved Production metadata | UNKNOWN | NONE | 2026-09-06 | Prior summary states absent; future artifact is NOT EXECUTED. |
| `auth.users` | Ownership decision | SUPABASE-MANAGED / EXTERNAL | HIGH (policy) | 2026-09-06 | Application baseline must not own or recreate it. |

## Required approved evidence

The metadata-only export must enumerate every `public` table, column, default, constraint, index, trigger, function/procedure, view/materialized view, sequence, enum/type/domain, owner, RLS metadata where relevant, and cross-schema dependency. It must explicitly establish `_prisma_migrations`, `CheckoutIdempotency`, and the FK from `public.users.auth_id` to `auth.users.id`. It must contain no business-row samples, PII, credentials, secrets, payment objects, or payment proofs.

Until reviewed, no candidate object is classified `MATCH`, no absent/present claim is independently verified, and no Prisma schema edit may be inferred.