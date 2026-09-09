# FASE 2.45-K — Final Production Baseline Reconciliation

**MODE:** Strict repository-only

**DATABASE ACCESS:** Forbidden

**PRODUCTION ACCESS:** Forbidden

**DDL/DML:** None

**RESULT:** **RECONCILIATION COMPLETE — EXECUTABLE BASELINE DEFERRED**

This document is a static repository reconciliation and dry-run record. It is not SQL, a migration, an executable baseline, or authorization to modify Production. No database, Prisma migration command, schema push, DDL, DML, environment, or secret was accessed or changed.

## A. Evidence sources

### Primary Production evidence bundle

- `docs/production-evidence/README.md`
- `docs/production-evidence/production-columns.md`
- `docs/production-evidence/production-constraints.md`
- `docs/production-evidence/production-indexes.md`
- `docs/production-evidence/production-security.md`
- `docs/production-evidence/production-functions-triggers.md`

### Existing reconciliation artifacts reviewed

- `docs/production-evidence-conflict-resolution.md`
- `docs/production-baseline-artifact.md`
- `docs/production-schema-manifest.md`
- `docs/production-ownership-manifest.md`
- `docs/production-drift-matrix-final.md`
- `docs/production-baseline-reconciliation.md`

The six-file Production evidence bundle is the current metadata source of truth for the facts it records. The K.2 conflict-resolution record and existing artifacts were also required inputs. Newer verified Production evidence takes precedence over clearly marked historical superseded statements. No active Production-fact conflict remains; incomplete evidence remains explicitly `PARTIAL`/`UNKNOWN` and is not treated as a conflict.

## B. 19-table reconciliation

The Production evidence bundle and baseline artifact agree on exactly these 19 `public` tables:

| # | Production table | Reconciliation |
|---:|---|---|
| 1 | `addresses` | MATCH — table boundary VERIFIED |
| 2 | `banners` | MATCH — table boundary VERIFIED |
| 3 | `cart_items` | MATCH — table boundary VERIFIED |
| 4 | `categories` | MATCH — table boundary VERIFIED |
| 5 | `checkout_histories` | MATCH — table boundary VERIFIED |
| 6 | `order_items` | MATCH — table boundary VERIFIED |
| 7 | `orders` | MATCH — table boundary VERIFIED |
| 8 | `parcel_packages` | MATCH — Production-only |
| 9 | `password_reset_tokens` | MATCH — table boundary VERIFIED |
| 10 | `payments` | MATCH — table boundary VERIFIED |
| 11 | `products` | MATCH — table boundary VERIFIED |
| 12 | `promotions` | MATCH — table boundary VERIFIED |
| 13 | `settings` | MATCH — table boundary VERIFIED |
| 14 | `stock_history` | MATCH — Production-only |
| 15 | `testimonials` | MATCH — table boundary VERIFIED |
| 16 | `user_vouchers` | MATCH — table boundary VERIFIED |
| 17 | `users` | MATCH — table boundary VERIFIED |
| 18 | `vouchers` | MATCH — table boundary VERIFIED |
| 19 | `wishlists` | MATCH — table boundary VERIFIED |

Additional boundary facts:

- `CheckoutIdempotency`: ABSENT from Production / future migration only.
- `_prisma_migrations`: ABSENT from Production.
- No extra historical public table is admitted into the baseline.

## C. Complete available column reconciliation

**Status:** `PARTIAL` — complete per-column metadata for all 19 tables is not available in the bundle.

| Scope | Evidence result | Reconciliation |
|---|---|---|
| 19-table membership | VERIFIED | Preserve exact table boundary |
| `orders.id` | `text NOT NULL` | Preserve; remaining columns PARTIAL |
| `users` columns | Detailed available inventory | Preserve available rows below |
| Other 17 tables | Complete rows unavailable | UNKNOWN; do not infer from Prisma/migrations |

### Available `public.users` column evidence

| Column | Type | Nullable | Default | Identity/generated | Status |
|---|---|---:|---|---|---|
| `id` | `text` | NO | none | NO / NO | VERIFIED |
| `name` | `text` | NO | none | UNKNOWN | PARTIAL |
| `email` | `text` | NO | none | UNKNOWN | PARTIAL |
| `phone` | `text` | YES | none | UNKNOWN | PARTIAL |
| `passwordHash` | `text` | YES | none | UNKNOWN | PARTIAL |
| `image` | `text` | YES | none | UNKNOWN | PARTIAL |
| `role` | `text` | NO | `'customer'::text` | UNKNOWN | PARTIAL |
| `isActive` | `boolean` | NO | `true` | UNKNOWN | PARTIAL |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` | UNKNOWN | PARTIAL |
| `updatedAt` | `timestamp without time zone` | NO | none | UNKNOWN | PARTIAL |
| `auth_id` | `uuid` | YES | none | UNKNOWN | PARTIAL |

Verified special fact: `users.id` is a text PK with no database default and is not identity/generated. `users.auth_id` is nullable UUID.

## D. Constraint reconciliation

**Status:** `PARTIAL` — every available Production constraint is preserved; complete constraint inventory remains unavailable.

| Table | Production constraint | Type | Available action/reference evidence | Reconciliation |
|---|---|---|---|---|
| `users` | `users_pkey` | PRIMARY KEY on `id` | — | PRESERVE — VERIFIED |
| `users` | `users_email_unique` | UNIQUE on `email` | — | PRESERVE — VERIFIED |
| `users` | `users_auth_id_unique` | UNIQUE on `auth_id` | — | PRESERVE — VERIFIED; drift versus Prisma |
| `users` | `users_auth_fk` | FK `auth_id → auth.users(id)` | `ON DELETE CASCADE`; ON UPDATE UNKNOWN | PRESERVE public side — PARTIAL; drift versus Prisma |
| `orders` | `orders_pkey` | PRIMARY KEY on `id` | — | PRESERVE — VERIFIED |
| `orders` | `orders_invoice_key` | UNIQUE on `invoice` | — | PRESERVE — VERIFIED; MATCH |

All listed Production constraints are preservation candidates. Complete CHECK constraints, remaining PK/UNIQUE/FK constraints, and remaining FK actions are `UNKNOWN`; none are invented from Prisma or migrations.

## E. Index reconciliation

**Status:** `PARTIAL` — available verified indexes are listed and preserved; complete index definitions remain unavailable.

| Table | Production index | Unique | Key | Reconciliation |
|---|---|---:|---|---|
| `users` | `users_pkey` | YES | `id` | PRESERVE — VERIFIED |
| `users` | `users_email_unique` | YES | `email` | PRESERVE — VERIFIED; MATCH |
| `users` | `users_auth_id_unique` | YES | `auth_id` | PRESERVE — VERIFIED; drift versus Prisma |
| `users` | `users_phone_key` | YES | `phone` | PRESERVE — VERIFIED; `users.phone @unique = MATCH` |
| `orders` | `orders_pkey` | YES | `id` | PRESERVE — VERIFIED |
| `orders` | `orders_invoice_key` | YES | `invoice` | PRESERVE — VERIFIED; MATCH |

The current evidence bundle resolves `users.phone` as `MATCH`, not confirmed drift. Exact access methods, predicates, expressions, and complete index coverage remain `UNKNOWN`.

### Resolved index evidence conflict

The following required source artifacts contained the former contradictory classification and were aligned in FASE 2.45-K.2:

| File | Superseded fact | Resolved fact |
|---|---|---|
| `docs/production-drift-matrix-final.md` | `users.phone` uniqueness “Not established” / `CONFIRMED DRIFT` | `users_phone_key UNIQUE(phone)` / `MATCH` |
| `docs/production-schema-manifest.md` | `phone`: “no Production uniqueness established” | `users_phone_key UNIQUE(phone)` / `MATCH` |
| `docs/production-baseline-reconciliation.md` | index inventory unavailable; phone unresolved | `users_phone_key UNIQUE(phone)` / `MATCH` |

Production `users.phone` uniqueness is verified by the repository evidence bundle:
`docs/production-evidence/production-indexes.md`

Previous classification was superseded by newer verified Production index evidence. The three source documents now classify Production `users_phone_key UNIQUE(phone)` versus Prisma `phone @unique` as `MATCH` with `LOW` risk.

## F. RLS/policy reconciliation

**Status:** `VERIFIED` for enabled state and public policy count; forced-RLS/owners/grants remain `UNKNOWN`.

| Table group | Production RLS | Reconciliation |
|---|---:|---|
| `cart_items` | ON | PRESERVE — VERIFIED |
| `payments` | ON | PRESERVE — VERIFIED |
| `stock_history` | ON | PRESERVE — VERIFIED |
| Remaining 16 public tables | OFF | PRESERVE — VERIFIED |

| Policy fact | Production result | Reconciliation |
|---|---:|---|
| Public policies | 0 | PRESERVE — VERIFIED |
| Forced RLS per table | Unavailable | UNKNOWN; do not infer |

No local policy SQL is treated as Production evidence.

## G. Function/trigger reconciliation

**Status:** `PARTIAL` — listed Production objects are preserved; complete ownership and exact trigger catalog state remain `UNKNOWN`.

| Object | Production evidence | Reconciliation |
|---|---|---|
| `public.update_updated_at_column()` | Exists; verified function body sets `NEW.updated_at = now()` | PRESERVE |
| `public.parcel_packages.update_parcel_packages_updated_at` | Exists; verified core update-timestamp behavior | PRESERVE |

No additional function or trigger is invented. The SQL fenced in the evidence bundle is documentation only and is not executed.

## H. Cross-schema reconciliation

| Dependency | Production result | Reconciliation |
|---|---|---|
| `public.users.auth_id` | Nullable `uuid` | PRESERVE — VERIFIED |
| `public.users(auth_id) → auth.users(id)` | FK, `ON DELETE CASCADE`, ON UPDATE UNKNOWN | PRESERVE public-side dependency — PARTIAL |
| `auth.users` | Supabase-managed | EXCLUDE from application baseline/ownership |

The target `auth.users` is not recreated, altered, or claimed by this reconciliation.

## I. Ownership reconciliation

| Scope | Classification | Baseline treatment |
|---|---|---|
| `auth.users` | SUPABASE-MANAGED / EXTERNAL | Exclude; document dependency only |
| `storage.*`, `extensions.*`, other managed schemas | SUPABASE-MANAGED / EXTERNAL | Exclude |
| `public.users(auth_id) → auth.users(id)` | CROSS-SCHEMA DEPENDENCY | Preserve public-side reference only |
| 17 model-backed public tables | Ownership UNKNOWN | Preserve boundary; do not generate DDL |
| `public.parcel_packages` | Production-only; ownership UNKNOWN | Preserve in Production |
| `public.stock_history` | Production-only; ownership UNKNOWN | Preserve in Production |
| `public.update_updated_at_column()` | Ownership UNKNOWN | Preserve, pending ownership review |
| Parcel update trigger | Ownership UNKNOWN | Preserve with table |
| `public."CheckoutIdempotency"` | FUTURE APPLICATION OBJECT | Exclude from historical baseline |

No public object is promoted to final `APPLICATION-OWNED` because the ownership manifest says PostgreSQL owners and complete definitions remain unknown.

## J. Confirmed drift

The following are confirmed Production-versus-Prisma/repository structural differences based on the supplied reconciliation requirements and evidence:

| Object/fact | Production evidence | Repository/Prisma comparison | Classification |
|---|---|---|---|
| `users.auth_id` | Nullable UUID exists | Missing from Prisma representation | CONFIRMED DRIFT |
| `users_auth_id_unique` | Exists on `users.auth_id` | Missing from Prisma representation | CONFIRMED DRIFT |
| `users_auth_fk` | Exists to `auth.users(id)`, delete CASCADE | Missing from Prisma representation | CONFIRMED DRIFT |
| `users.phone @unique` | `users_phone_key UNIQUE(phone)` | Declared `@unique` | MATCH, not drift |
| `users.email` uniqueness | `users_email_unique` | Declared unique | MATCH |
| `orders.invoice` uniqueness | `orders_invoice_key` | Declared unique | MATCH |
| `parcel_packages` | Exists | No Prisma model | PRODUCTION-ONLY |
| `stock_history` | Exists | No Prisma model | PRODUCTION-ONLY |
| RLS on `cart_items`, `payments`, `stock_history` | ON | Not modeled by Prisma | PRODUCTION-ONLY metadata |
| Public policies | 0 | Local policy artifact differs | Production state wins |
| Update function and parcel trigger | Exist | Not modeled by Prisma | PRODUCTION-ONLY metadata |

The former `users.phone` confirmed-drift row is retained as superseded historical context in Section E; the active classification is `MATCH`.

## K. Candidate drift

These remain `UNKNOWN` or `PARTIAL` because the Production bundle is partial:

- Complete columns, defaults, identity/generated state, and types for the other tables.
- `users` identity/generated state except `users.id`.
- Complete PK, UNIQUE, FK, CHECK, exclusion, and FK-action inventory.
- Complete index definitions, predicates, expressions, and access methods.
- `products.categoryId` FK status.
- Forced-RLS state, owners, grants, and ACLs.
- Complete function/trigger definitions and enabled state.
- Materialized views, custom types, enums, domains, and complete cross-schema dependencies.

Incomplete metadata is not converted into DDL or a confirmed Production fact.

## L. Production-only

The following Production objects/behaviors must remain in the preservation boundary even though they are not represented by the Prisma model:

- `public.parcel_packages`
- `public.stock_history`
- RLS ON for `cart_items`, `payments`, and `stock_history`
- zero public policies
- `public.update_updated_at_column()`
- `public.parcel_packages.update_parcel_packages_updated_at`
- `public.users.auth_id`
- `users_auth_id_unique`
- `users_auth_fk`
- cross-schema dependency to `auth.users(id)` without claiming target ownership

## M. Prisma-only

- `CheckoutIdempotency` model/migration artifact: future only, absent from Production.
- Local `_prisma_migrations` history artifact: absent from Production.
- Any Prisma-defined relation, constraint, index, default, or column not supported by the Production evidence bundle: not admitted as Production metadata.

The existing `CheckoutIdempotency` repository migration is not executed, copied into the historical baseline, or treated as Production evidence.

## N. Baseline preservation candidates

These are documentation-level preservation candidates only, not executable DDL:

1. The exact 19-table `public` boundary.
2. Available verified columns for `users` and `orders.id`.
3. All Production constraints listed in Section D.
4. All Production indexes listed in Section E, including `users_phone_key`.
5. RLS states and zero public policies.
6. `public.update_updated_at_column()`.
7. `public.parcel_packages.update_parcel_packages_updated_at`.
8. `users.auth_id → auth.users.id` public-side dependency with delete CASCADE.
9. Production-only `parcel_packages` and `stock_history`.

Every candidate whose exact metadata or ownership is `PARTIAL`/`UNKNOWN` remains blocked from executable baseline generation.

## O. Explicit exclusions

- `auth.users` and all Supabase-managed schemas/objects.
- `storage.*`, `extensions.*`, and extension-owned objects.
- `public."CheckoutIdempotency"` from historical baseline.
- `_prisma_migrations` as a Production business-schema object.
- Business rows, PII, payment objects, payment proofs, credentials, tokens, keys, cookies, JWTs, and secrets.
- Any guessed columns, constraints, indexes, policies, ownership, or cross-schema dependencies.
- Any executable baseline SQL or baseline migration.

## P. Future migrations

| Migration/object | State | Treatment |
|---|---|---|
| Future approved Production baseline | Not created | Blocked pending complete evidence; the K.2 conflict is resolved |
| `20260905000000_add_checkout_idempotency` | Repository artifact; not executed | Separate future additive migration; excluded |

No migration was created, changed, executed, resolved, or marked applied.

## Q. Remaining UNKNOWN/PARTIAL

The evidence bundle explicitly remains `PARTIAL` for columns, constraints, indexes, and function/trigger inventory. The following remain `UNKNOWN` or incomplete:

- Exact application DB identity.
- Complete column inventory for 18 tables and remaining `orders` columns.
- Complete CHECK/exclusion/FK inventory and all FK actions.
- Complete index inventory and exact definitions.
- Forced-RLS state.
- Object owners, grants, and ACLs.
- Exact trigger definition/enabled state and complete function inventory.
- Materialized views, custom types, enums, and domains.
- Complete managed-schema/storage/extension dependency graph.
- Complete identity/generated state outside `users.id`.

These statuses are retained and are not downgraded to `VERIFIED`.

## R. Dry-run findings

| Check | Result | Evidence |
|---|---|---|
| A. Missing Production objects | PASS for required preservation boundary | All 19 tables plus Production-only objects are listed |
| B. Invented objects | PASS | No new Production object was invented |
| C. Prisma-only objects entering historical baseline | PASS | `CheckoutIdempotency` and local history excluded |
| D. Supabase-managed objects entering baseline | PASS | `auth.users` excluded; dependency only |
| E. `CheckoutIdempotency` entering historical baseline | PASS | Explicitly excluded |
| F. Production-only objects omitted from preservation | PASS | `parcel_packages`, `stock_history` retained |
| G. RLS/function/trigger loss | PASS | RLS, zero policies, function, trigger retained |
| H. Cross-schema auth dependency loss | PASS | Public-side FK dependency retained |
| I. Confirmed drift misclassification | PASS | Active artifacts classify `users.phone` as MATCH; auth drift remains confirmed |
| J. Verified index/constraint classified UNKNOWN | PASS for `users_phone_key` | Verified `users_phone_key UNIQUE(phone)` is retained; broader index metadata remains PARTIAL |
| Complete metadata gate | FAIL | Bundle status is PARTIAL; many fields remain UNKNOWN |
| Executable baseline created | PASS — not created | Documentation only |

The repository source artifacts now agree on the authoritative `users.phone` classification. The reconciliation retry may proceed, but the complete metadata gate remains blocked by the `PARTIAL`/`UNKNOWN` items in Section Q.

## S. FINAL RECONCILIATION AFTER K.2

The repository-only reconciliation retry was completed after the K.2 resolution. The former `users.phone` conflict is resolved by the latest verified Production index evidence: Production has `users_phone_key UNIQUE(phone)`, Prisma declares `phone @unique`, and the active classification is `MATCH` with `LOW` risk. The historical conflict record in Section E and `docs/production-evidence-conflict-resolution.md` is retained and explicitly superseded; it is not an active classification.

All required preservation and exclusion checks in Section R pass. The baseline artifact is consistent with the verified 19-table boundary, both Production-only tables, auth cross-schema dependency, RLS state, zero public policies, and the known function/trigger. `CheckoutIdempotency` remains absent from Production, excluded from the historical baseline, and reserved for the unexecuted future migration `20260905000000_add_checkout_idempotency`.

This pass is documentation reconciliation only. It does not open the executable baseline gate: every item in Section Q remains individually visible as `UNKNOWN` or `PARTIAL`, and no object is promoted to application-owned without evidence.

### Final gate

```text
EVIDENCE CONFLICT: NO
ACTIVE USERS_PHONE CONFLICT: NO
BASELINE ARTIFACT CONSISTENT: YES
DRY-RUN PASS: YES
PRODUCTION TOUCHED: NO
EXECUTABLE BASELINE CREATED: NO
CHECKOUTIDEMPOTENCY IN BASELINE: NO
DOCUMENTATION: COMPLETE
RECONCILIATION: COMPLETE — repository evidence consolidated
BASELINE READY: NO — complete metadata remains PARTIAL/UNKNOWN
BASELINE EXECUTION: DEFERRED
CHECKOUTIDEMPOTENCY: FUTURE MIGRATION ONLY
```

### Resolved conflict record

The contradictory `users.phone` statements were reconciled in:

- `docs/production-drift-matrix-final.md`
- `docs/production-schema-manifest.md`
- `docs/production-baseline-reconciliation.md`

Their `users.phone`/`users_phone_key` claims are aligned with `docs/production-evidence/production-indexes.md`. This resolves the documentation conflict only; no executable baseline or Production operation is authorized while remaining evidence is `PARTIAL`/`UNKNOWN`.