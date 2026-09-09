# FASE 2.45-I.2 — Production Metadata Completeness

**SOURCE OF TRUTH:** Existing verified Production evidence in this repository only.

**ACCESS MODE:** Repository-only audit. No Production connection or SQL execution was performed.

## Overall status

**METADATA COMPLETE:** `NO`

The evidence bundle is sufficient to consolidate the verified Production boundary and known metadata, but it does not contain complete catalog output for every requested category. Missing or explicitly unknown values remain `INCOMPLETE`/`UNKNOWN`; they are not inferred from Prisma schema or migration SQL.

## Category assessment

| Category | Status | Evidence-backed conclusion |
|---|---|---|
| Public table boundary | COMPLETE | Exactly 19 public tables are listed, including `parcel_packages` and `stock_history`. |
| Column inventory | INCOMPLETE | `users` detail and limited `orders.id` detail are available; complete rows for all 19 tables are not available. |
| PK/UNIQUE/FK constraints | INCOMPLETE | Known `users` and `orders` constraints are recorded; complete 19-table inventory is not available. |
| CHECK constraints | INCOMPLETE | Complete CHECK result set is not available. |
| Indexes | INCOMPLETE | Known indexes include `users_phone_key`; complete index inventory/definitions are not available. |
| `users.phone` uniqueness | COMPLETE | `users_phone_key UNIQUE(phone)` is verified. |
| `users.auth_id → auth.users.id` | COMPLETE | Cross-schema FK and `ON DELETE CASCADE` are verified; `ON UPDATE` remains unknown. |
| Identity/generated columns | INCOMPLETE | Not complete beyond the verified `users.id` fact. |
| Sequences | INCOMPLETE | Complete sequence inventory is not available. |
| RLS state | COMPLETE | Per-table enabled-state evidence for all 19 public tables is recorded. |
| Policies | COMPLETE | Observed public policy count is `0`. |
| FORCE RLS | INCOMPLETE | Exact per-table FORCE RLS values are unavailable. |
| Functions | INCOMPLETE | `public.update_updated_at_column()` is verified; complete inventory and ownership/ACL are unavailable. |
| Triggers | INCOMPLETE | `public.parcel_packages.update_parcel_packages_updated_at` is verified; complete catalog details are unavailable. |
| Views/materialized views | INCOMPLETE | Complete inventory is not available. |
| Enum/domain/custom types | INCOMPLETE | Complete inventory is not available. |
| Ownership/ACL | INCOMPLETE | Owners and grants/ACLs are unavailable. |
| `CheckoutIdempotency` | COMPLETE | Absent from Production; future migration only. |
| `_prisma_migrations` | COMPLETE | Absent from Production. |
| PostgreSQL/database identity | COMPLETE | PostgreSQL `17.6`, database `postgres`, schema `public` are verified. |

## FASE 2.53 targeted cancellation-inventory evidence

The repository evidence bundle was re-audited without connecting to Production. Table membership alone does not verify a column, physical type, nullability, default, PK/UNIQUE constraint, or FK. Application queries, Prisma declarations, and local Supabase migration files are deliberately excluded as Production catalog proof.

| Required fact | Status | Evidence-backed conclusion |
|---|---|---|
| `order_items` table | COMPLETE | Membership in the verified 19-table `public` boundary is established. |
| `order_items.id` | INCOMPLETE | No stored Production column/type/nullability/default or PK/UNIQUE row is available. |
| `order_items.productId` | INCOMPLETE | No stored Production column/type/nullability or FK row to `products.id` is available. |
| `order_items.quantity` | INCOMPLETE | No stored Production physical column/type/check evidence is available. |
| `order_items.createdAt` / `created_at` | INCOMPLETE | Neither spelling nor physical timestamp representation is established by stored Production catalog evidence. |
| `products` table | COMPLETE | Membership in the verified 19-table `public` boundary is established. |
| `products.id` | INCOMPLETE | No stored Production column/type or PK/UNIQUE row is available. |
| `products.stock` | INCOMPLETE | No stored Production physical type/check/default evidence is available. |
| `products.createdAt` / `created_at` | INCOMPLETE | Neither relevant spelling nor physical timestamp representation is established by stored Production catalog evidence. |
| `order_items.productId → products.id` | INCOMPLETE | Referencing/referenced columns, referenced uniqueness, and FK actions are not present in the stored constraint evidence. |
| `stock_history` table | COMPLETE | Membership as a Production-only public table is verified. |
| `stock_history.quantity` | INCOMPLETE | No stored Production column/type/check evidence is available. |
| `stock_history.product_id` | INCOMPLETE | No stored Production column/type/FK evidence is available. |
| `stock_history.transaction_type` | INCOMPLETE | No stored Production column/type/check/default evidence is available. |
| Relevant identity PK/UNIQUE compatibility | INCOMPLETE | `orders.id` PK is verified, but `order_items.id` and `products.id` uniqueness/type evidence is missing. |
| Physical quantity representation | INCOMPLETE | Production catalog types/checks for order quantity, stock, and history quantity are unavailable. |
| Physical timestamp representation | INCOMPLETE | Required order-item/product/ledger-compatible Production timestamp evidence is unavailable. |

`ABSENT` is not assigned to missing evidence: absence of a catalog row in this partial bundle does not prove absence of the database object. New authorized Supabase SQL Editor catalog output is required to change any targeted `INCOMPLETE` status to `COMPLETE` or `ABSENT`.

## Gate

```text
DOCUMENTATION = COMPLETE
RECONCILIATION = COMPLETE (evidence consolidation only)
BASELINE READY = NO
BASELINE EXECUTION = DEFERRED
CHECKOUTIDEMPOTENCY = FUTURE MIGRATION ONLY
TARGETED CANCELLATION METADATA = INCOMPLETE
```

The `INCOMPLETE` categories above prevent a claim that complete Production metadata or an executable baseline is ready.