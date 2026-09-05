# FASE 2.34 — SCHEMA & BASELINE READINESS REPORT

**Project:** AFA STORE
**Audit mode:** read-only / no database mutation
**Date:** 2026-09-05
**Status:** **PARTIAL — PRODUCTION NOT READY**

## Executive decision

`BASELINE REQUIRED — MIGRATION BLOCKED`
`INTEGRATION TEST — BLOCKED`
`SCHEMA CHANGE REQUIRED — DEFERRED`

No migration, introspection, seed, DDL, production checkout, payment, webhook, or database write was performed.

## 1. Status vocabulary audit

### Canonical persistence vocabulary

| Field | Canonical values | Evidence / purpose |
|---|---|---|
| `Order.status` | `PENDING`, `PROCESSING`, `PACKED`, `SHIPPED`, `COMPLETED`, `CANCELLED` | `src/lib/payment-transition.ts`; fulfillment state. Checkout writes `PENDING`; successful payment may advance `PENDING` to `PROCESSING`. |
| `Order.paymentStatus` | `PENDING`, `PAID`, `EXPIRED`, `CANCELLED` | Checkout and webhook writes; compatibility projection of payment state. |
| `Payment.status` | `PENDING`, `PAID`, `EXPIRED`, `CANCELLED` | `src/lib/payments.ts` and webhook; authoritative payment state. |

### Inventory findings

- `PENDING`, `PROCESSING`, `PACKED`, `SHIPPED`, `COMPLETED`, `CANCELLED`, `PAID`, and `EXPIRED` occur in application transitions, queries, API responses, tests, or UI state labels.
- `WAITING_PAYMENT` and `WAITING_CONFIRMATION` occur only in `src/components/payment/payment-proof-form.tsx` as UI compatibility labels. They are **UI-only legacy vocabulary**, not valid canonical writes.
- Lowercase `pending` appears in the Prisma default for `Order.status` and in the admin pending-count compatibility filter. The Prisma value is a **legacy schema default**; the admin value is a **legacy/UI compatibility read**.
- `CheckoutIdempotency.status` uses `PROCESSING` and `COMPLETED`. These are idempotency lifecycle values, not order or payment status values.
- HTTP response property `status` and UI labels must not be interpreted as database status columns.

## 2. Prisma schema audit

### Relevant model findings

- `Order`: `id` primary key, `invoice` unique, optional `userId`, integer monetary fields, nullable proof/timestamp/fulfillment metadata, one-to-one optional `Payment`, one-to-many `OrderItem` and `CheckoutHistory`.
- `Order.status @default("pending")`: **MISMATCH / legacy default**.
- `Order.paymentStatus @default("WAITING_PAYMENT")`: **MISMATCH / legacy default**.
- `Payment`: one-to-one unique `orderId`, integer `amount`, unique nullable `transactionRef`, nullable Midtrans metadata, `status @default("PENDING")`.
- `CheckoutIdempotency`: unique `key`, unique nullable `orderId`, required `userId` and `requestHash`, JSON response, timestamps, optional expiry, indexes on `userId` and `(status, expiresAt)`.
- `Product`: primary key `id`, optional category relation, integer `price` and `stock`, no Prisma stock-history relation.
- `CartItem`: optional product relation, positive-quantity intent in Supabase SQL, user/product-reference uniqueness represented in SQL but not as a Prisma composite unique constraint.
- `CheckoutHistory`: nullable user/order relations with `SET NULL`, JSON item snapshot, integer totals, timestamp.

### Default assessment

A. The two legacy defaults are no longer required by the canonical checkout path.
B. New checkout explicitly supplies `Order.status = "PENDING"` and `paymentStatus = "PENDING"`; Payment defaults to canonical `PENDING`.
C. Existing code should not depend on the legacy values, but admin/UI compatibility reads and old rows may still encounter them.
D. Changing either Prisma default is a schema migration.
E. Existing rows require an approved data audit/backfill decision; do not assume they are clean.
F. Changing defaults without backfill is technically additive to future inserts but not semantically safe until legacy rows are measured and read compatibility is retained.
G. Status cleanup is deferred to a separate approved phase, not bundled with idempotency deployment.

## 3. Production schema mapping

The supplied Production baseline states: 19 public tables, no `_prisma_migrations`, `CheckoutIdempotency` absent, and `public.users` referencing Supabase-managed `auth.users`. No `db pull`, introspection, or database connection was used.

| Production table | Prisma model | Result |
|---|---|---|
| `users` | `User` | **UNKNOWN** — logical name and auth FK known; exact columns/constraints not reverified in this phase |
| `orders` | `Order` | **UNKNOWN** — logical mapping known; exact Production columns/defaults/indexes not reverified |
| `order_items` | `OrderItem` | **UNKNOWN** |
| `payments` | `Payment` | **UNKNOWN** |
| `products` | `Product` | **UNKNOWN** — Supabase migrations show additional/possibly divergent product columns |
| `categories` | `Category` | **UNKNOWN** |
| `cart_items` | `CartItem` | **PARTIAL** — local Supabase artifact documents columns, checks, indexes, RLS, and trigger; Production not introspected |
| `checkout_histories` | `CheckoutHistory` | **UNKNOWN** |
| remaining public business tables | corresponding Prisma models where names are mapped by `@@map` | **UNKNOWN** |
| `auth.users` | no Prisma-owned model | **EXTERNAL / NOT OWNED** |
| `CheckoutIdempotency` | `CheckoutIdempotency` | **MISSING in stated Production baseline** |

Exact production mapping is therefore **not complete** by policy. It must be completed using approved read-only schema evidence in a controlled change-planning phase—not by `db pull` in this audit.

## 4. CheckoutIdempotency migration review

Artifact: `prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql`
SHA-256: `8290669ccc69fd9c37edaf6279c0c636550ccc7d93021ad3f6b85e40382c242c`

Static result:

- Creates only `"CheckoutIdempotency"` and its primary key, two unique indexes, two secondary indexes, and two foreign keys.
- Does not drop or alter existing business tables, existing rows, existing indexes, or `auth.users`.
- FK targets are `users(id)` and `orders(id)` with `CASCADE` and `SET NULL` behavior matching Prisma.
- Column names, nullability, JSONB, timestamps, and defaults match the Prisma model.
- The SQL necessarily contains `CREATE TABLE` and `ALTER TABLE ... ADD CONSTRAINT`; it must **not** be executed in FASE 2.34.
- It is additive in scope, but not idempotent for repeated manual execution (`CREATE TABLE` lacks `IF NOT EXISTS`). Approved deployment must establish one-time execution and failure handling.

## 5. Baseline strategy comparison

| Option | Safety | Complexity | Compatibility / maintainability | Assessment |
|---|---|---|---|---|
| A — baseline existing schema as migration history | High if verified; unsafe if guessed | Medium | Good future Prisma workflow | Viable after exact schema inventory and ownership agreement |
| B — baseline artifact representing existing schema without executing it | High operationally | High documentation burden | Can drift from real schema | Useful as evidence, not sufficient alone for Prisma history |
| C — `externalTables` for `auth.users` | Good boundary | Medium / version-dependent | Strong Supabase compatibility | Appropriate for external auth ownership, subject to supported Prisma configuration |
| D — hybrid public application baseline + Supabase-owned auth + future Prisma migrations | Highest ownership clarity | Medium | Best future maintainability | **Recommended** |

Recommendation: adopt **D**, after a separately approved read-only mapping and baseline review. Do not run `prisma migrate deploy` while `_prisma_migrations` is absent and baseline ownership is unresolved.

## 6. Schema change plan

### REQUIRED NOW (deferred)

- **SCHEMA CHANGE REQUIRED — DEFERRED:** correct future defaults for `Order.status` and `Order.paymentStatus`, with a separate legacy-row audit/backfill policy.
- **REQUIRED for checkout rollout:** create `CheckoutIdempotency` using the reviewed artifact, only after baseline approval and isolated testing.

### RECOMMENDED LATER

- stale idempotency recovery metadata (attempt ownership/lease or processing timestamps)
- webhook event ledger with provider event identity and deduplication
- cart version or checkout marker for ABA-safe cart cleanup
- payment-proof metadata (storage key, content hash, size, MIME, uploaded/replaced timestamps)
- transactional outbox/job table
- reconciliation state for late provider events and post-commit failures

### OPTIONAL

- database check constraints for canonical status domains, after legacy data cleanup and compatibility analysis
- richer audit/event history if operational requirements justify it

Do not combine these into one migration.

## 7. Stock invariant audit

Observed sale decrement: checkout transaction only, through conditional `tx.product.updateMany` with `stock >= qty` and `stock: { decrement: qty }`, followed by order creation. This provides one winner for stock-one concurrency within the transaction and rollback on order failure.

Observed other stock writes: admin UI directly updates `products.stock` and separately inserts `stock_history`; this is manual inventory adjustment, not sale movement, and the two operations are not atomic. No active webhook, expiration, cancellation, or completion stock mutation was found. `stock_history` is Supabase-managed and not a Prisma model.

Invariants:

- SALE STOCK DECREMENT = exactly once per successfully committed checkout order.
- WEBHOOK = zero stock mutation.
- COMPLETED = zero additional sale decrement.
- CANCEL/EXPIRE restoration = not active by policy.
- Checkout sale path cannot decrement below zero due to conditional predicate; admin path clamps client-side but requires server/database policy review.

Potential concern to monitor: manual admin writes can race with checkout and history can fail after stock succeeds. No double sale movement was found in the audited callers.

## 8. Idempotency data model review

Current model is sufficient for normal retry, same-key duplicate, different-request conflict, cross-user conflict, and response replay because `key`, `userId`, `requestHash`, stored response, and unique order binding are present.

It is not sufficient for robust stale `PROCESSING` recovery, operator ownership, attempt fencing, explicit retention, or durable failure classification. Current `expiresAt` is nullable and not a processing lease.

**MINIMAL CURRENT MODEL:** retain current fields; deploy only after baseline approval.
**ROBUST FUTURE MODEL — SCHEMA CHANGE REQUIRED — FUTURE:** lease/heartbeat or attempt token, terminal error metadata, retention/deletion policy, and possibly provider/outbox correlation.

## 9. Payment-proof storage architecture

Current storage is local filesystem under `public/uploads/payment-proofs`, with a public URL stored in `Order.paymentProof`. It is public, persistent only relative to the deployment filesystem, not serverless-safe or multi-instance durable, and has no storage-level access control. The file is written before the conditional DB transaction; if a webhook wins, the file can be orphaned. Replacement cleanup is not implemented.

Recommended future architecture: private durable object storage, opaque per-order object keys, server-authorized upload/download or signed URLs, DB reference plus content metadata, transactional/outbox cleanup, and a garbage-collection job for unreferenced objects. Do not move storage in this phase.

## 10. Post-transaction reliability matrix

| Failure | Current behavior / risk | Recovery / protection | Recommended architecture |
|---|---|---|---|
| DB commit + Midtrans success + payment update fails | QRIS charge succeeds; payment metadata update fails; retry/recovery relies on webhook | Provider webhook can reconcile; transaction identity must be retained/logged | durable payment intent + reconciliation/outbox |
| DB commit + Midtrans timeout | order/stock may commit before provider result is known | retry with same idempotency key; inspect provider status | asynchronous provider command and durable intent state |
| DB commit + cart cleanup fails | committed order is replayable; stale cart may remain | idempotency response prevents duplicate order; cleanup retry needed | durable cleanup job/outbox |
| DB commit + cookie cleanup fails | browser can retain checkout cookie | replay remains idempotent; clear on later response | client retry plus server-side checkout session state |
| Midtrans success + client timeout | client sees failure although provider succeeded | webhook and stored order/payment identity reconcile | provider event ledger and reconciliation dashboard |

No outbox was implemented.

## 11. Isolated PostgreSQL integration-test design

Environment audit: `psql`, `postgres`, and Docker were not available on PATH. **STATUS = DESIGN ONLY / INTEGRATION TEST — BLOCKED.** No database was contacted.

Future harness requirements:

- use `TEST_DATABASE_URL` only;
- fail closed if absent, equal to `DATABASE_URL`, or host matches a production allow/deny list;
- reject Supabase production project identifiers and production credentials;
- use an isolated disposable PostgreSQL database/schema with explicit teardown;
- never load Production data or secrets.

Required scenarios: concurrent stock-one checkout; same idempotency key; same key with different request; cross-user key; duplicate webhook; amount mismatch; transaction rollback; late webhook; payment-upload race; cart ABA race; invoice concurrency; Midtrans timeout recovery. Assertions must include committed rows, stock count, status monotonicity, duplicate suppression, and rollback atomicity.

## 12. Migration-readiness checklist

- [ ] baseline strategy approved
- [ ] exact Production schema mapping complete
- [ ] CheckoutIdempotency artifact reviewed
- [x] local migration hash recorded
- [ ] backup and rollback strategy approved
- [ ] isolated PostgreSQL concurrency tests passed
- [x] application static validation passed
- [ ] deployment order and change window approved
- [ ] monitoring and alert thresholds defined
- [ ] recovery/reconciliation runbook approved
- [ ] Production approval recorded

**STATUS: NOT READY.**

## 13. Validation results

- `node --test tests/*.test.mjs`: **PASS — 31/31**
- `npx prisma validate`: **PASS**
- `npx tsc --noEmit`: **PASS**
- `npx eslint .`: **PASS with 3 pre-existing warnings** (`Camera`, `storagePathFromPublicUrl`, `Link` unused)
- `git diff --check`: **PASS**
- No migration/db push/db pull/seed/reset/introspection command executed.

## 14. Remaining blockers

1. No approved baseline strategy or `_prisma_migrations` history.
2. Exact Production-to-Prisma mapping remains UNKNOWN by safety policy.
3. Legacy Order defaults and existing-row cleanup policy unresolved.
4. CheckoutIdempotency table is absent in stated Production baseline.
5. No isolated PostgreSQL runtime is available.
6. Durable webhook reconciliation/outbox is absent.
7. Payment-proof files can orphan and are not durable/private.
8. Admin stock adjustment/history is not atomic.

## 15. Exact FASE 2.35 recommendation

**FASE 2.35 — BASELINE EVIDENCE & ISOLATED CONCURRENCY GATE:** approve the hybrid ownership strategy; obtain a controlled, read-only Production schema inventory through approved tooling; provision a disposable PostgreSQL environment; execute the required concurrency/recovery test suite; and produce a separately reviewed status-default/backfill plan. Do not apply any Production migration until every readiness checklist item is approved.

**Production state remains: NOT READY.**