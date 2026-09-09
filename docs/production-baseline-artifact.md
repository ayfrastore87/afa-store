# AFA Store — Production Baseline Artifact

**Phase:** FASE 2.45-J
**Artifact type:** repository-only, non-executable documentation
**Production source of truth:** FASE 2.45-I Master Production Inventory
**Status:** **BLOCKED — INCOMPLETE METADATA**

## Purpose

This artifact defines the safe boundary for a future Prisma baseline of the already-existing Production `public` schema. It is not migration SQL, is not a Prisma migration, and must not be executed or marked as applied.

No executable baseline migration is created in this phase because the FASE 2.45-I inventory reports `METADATA COMPLETE: NO`. Complete columns, constraints, indexes, ownership, identity/generated state, custom types, and cross-schema dependencies are still unavailable. Generating DDL from `prisma/schema.prisma` would incorrectly substitute intended application state for observed Production state.

## Production boundary

The verified Production boundary contains exactly 19 `public` base tables:

1. `addresses`
2. `banners`
3. `cart_items`
4. `categories`
5. `checkout_histories`
6. `order_items`
7. `orders`
8. `parcel_packages`
9. `password_reset_tokens`
10. `payments`
11. `products`
12. `promotions`
13. `settings`
14. `stock_history`
15. `testimonials`
16. `user_vouchers`
17. `users`
18. `vouchers`
19. `wishlists`

Verified absence:

- `public._prisma_migrations`
- `public."CheckoutIdempotency"`

See [production-schema-manifest.md](production-schema-manifest.md) for the evidence ledger and [production-ownership-manifest.md](production-ownership-manifest.md) for lifecycle boundaries.

## Baseline inclusion policy

A future executable baseline may include only already-existing, fully evidenced, application-owned `public` objects. It must preserve, where verified:

- exact columns, PostgreSQL types, nullability, defaults, identity and generated state;
- primary, unique, foreign-key, check, and exclusion constraints;
- exact indexes, predicates, expressions, and constraint backing;
- RLS and policies;
- application-owned functions and triggers;
- views, materialized views, sequences, and custom types;
- public-side cross-schema dependencies without claiming their external targets.

Unknown metadata must never be reconstructed from Prisma or historical repository SQL.

## Explicit exclusions

The future baseline must not create, alter, drop, or claim ownership of:

- `auth.users` or any other object in Supabase-managed schemas;
- `storage.*`, `extensions.*`, or extension-owned objects;
- `public."CheckoutIdempotency"`, which does not yet exist in Production;
- any object whose Production existence or ownership remains unknown.

## Production-specific metadata not represented by Prisma

The following verified objects/behavior must not be lost merely because Prisma does not model them:

- `public.users.auth_id uuid NULL`;
- `users_auth_id_unique` on `users.auth_id`;
- `users_auth_fk` from `public.users(auth_id)` to `auth.users(id)` with `ON DELETE CASCADE`;
- `public.parcel_packages`;
- `public.stock_history`;
- RLS enabled on `cart_items`, `payments`, and `stock_history`;
- zero verified public policies;
- `public.update_updated_at_column()`;
- trigger `update_parcel_packages_updated_at` on `public.parcel_packages`.

The `auth.users` target remains Supabase-managed and is excluded from application DDL. Only the public-side dependency may be represented after exact FK metadata and ownership are approved.

## Objects intentionally not modeled in Prisma

| Object | Reason | Baseline treatment |
|---|---|---|
| `auth.users` | Supabase-managed authentication table | Exclude; document external dependency only |
| `storage.*` | Supabase-managed storage objects | Exclude |
| `extensions.*` and extension objects | Platform-managed | Exclude |
| `public.parcel_packages` | Existing Production-only table; ownership/definition incomplete | Preserve in Production; do not infer DDL |
| `public.stock_history` | Existing Production-only table; ownership/definition incomplete | Preserve in Production; do not infer DDL |
| PostgreSQL RLS metadata | Not represented by Prisma schema | Preserve through reviewed SQL only after evidence |
| `public.update_updated_at_column()` | PostgreSQL function not represented by Prisma | Preserve after ownership/definition approval |
| Parcel update trigger | PostgreSQL trigger not represented by Prisma | Preserve after exact trigger evidence |

## Future migrations

| Order | Migration | State | Baseline inclusion |
|---:|---|---|---|
| 1 | Future approved Production baseline | Not created; blocked by incomplete metadata | N/A |
| 2 | `20260905000000_add_checkout_idempotency` | Existing repository artifact; not executed | **EXCLUDED** |

`CheckoutIdempotency` must remain a separate additive future migration after the baseline is complete, reviewed, tested in a disposable environment, and separately approved. Existing migration history must not be rewritten.

## Completion gate for executable baseline

All of the following are required before executable baseline SQL can be generated:

1. Complete catalog-only metadata for all 19 tables and all related public objects.
2. Exact constraint and index definitions from PostgreSQL catalogs.
3. Complete ownership and cross-schema dependency classification.
4. Resolution of every confirmed and candidate drift without destructive reconciliation.
5. Review proving `CheckoutIdempotency` is absent from the baseline.
6. Disposable PostgreSQL 17/Supabase-compatible reconstruction test.
7. Separate approval for any later Production history operation.

## Safety declaration

This phase creates documentation only. It performs no Production query or write, no migration command, no schema push, and no environment or credential change.

```text
EXECUTABLE BASELINE SQL: NOT CREATED
BASELINE STATUS: BLOCKED
PRODUCTION TOUCHED: NO
CHECKOUTIDEMPOTENCY IN BASELINE: NO
```