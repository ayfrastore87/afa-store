# FASE 2.50 — Migration Approval Gate

**Mode:** future migration design and rehearsal readiness only
**Environment:** disposable non-Production database required
**Date:** 2026-09-09
**Migration approval:** not granted
**Production execution approval:** not granted

## 1. Absolute boundary

No database was created or connected, no SQL/DDL/DML was run, and no Prisma migration/db command was run. No migration artifact, Prisma schema, package/dependency, environment, secret, or deployment configuration was changed. Production metadata remains incomplete and `BASELINE READY = NO`.

The two migration domains must remain separate because they have distinct business identities, release risks, rollback/disable paths, and application consumers. Combining them would couple checkout availability to cancellation policy without a correctness benefit.

## 2. Migration A — CheckoutIdempotency

**Status: `CHECKOUTIDEMPOTENCY = FUTURE MIGRATION ONLY / NOT EXECUTED`.**
The existing artifact `prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql` remains unchanged and is not approved by this document.

| Area | Future design / gate requirement |
|---|---|
| Purpose | Persist deterministic checkout request claims/results so duplicate checkout submissions do not create duplicate orders |
| Tables affected | Proposed new application-owned `CheckoutIdempotency`; referenced existing `users` and `orders` only as established by the unchanged artifact/model |
| Columns | Existing artifact proposes `id`, `key`, `userId`, nullable `orderId`, `requestHash`, `status`, nullable `responsePayload`, `createdAt`, `updatedAt`, nullable `expiresAt`; no change proposed here |
| Constraints | Primary key; unique checkout `key`; unique nullable `orderId`; FKs must be catalog/rehearsal compatible |
| Indexes | Existing design indexes `userId` and `(status, expiresAt)` plus unique indexes; names/types/order must be reviewed from artifact and target metadata |
| FK | `userId -> users.id` with intended cascade behavior and `orderId -> orders.id` with intended set-null behavior; exact compatibility/ownership must be verified |
| Data migration | None intended. Do not backfill historical checkout claims or bundle status-default cleanup |
| Rollback strategy | Before writes, artifact removal is possible in disposable rehearsal. After use, prefer application disable/forward fix; never drop durable request evidence casually. Production rollback needs separate approval |
| Lock risk | Additive table creation is relatively isolated, but FK validation/catalog locks and namespace/index creation must be measured in rehearsal |
| Compatibility | Application must tolerate table unavailable until explicitly deployed; legacy Production baseline reportedly lacks it but catalog verification is incomplete |
| Rehearsal requirement | Apply only to a disposable schema/data clone with non-sensitive representative data; test creation, FKs, unique keys, duplicate/concurrent claims, rollback, and old/new application behavior |
| Approval requirement | Technical review + migration approval after metadata/rehearsal; separately scoped Production execution approval still required |

It must not be reused for cancellation: a checkout request identity is not an inventory recovery identity.

## 3. Migration B — Cancellation / Inventory Recovery

**Status: future design only; no schema selected or artifact created.**

| Area | Future design / gate requirement |
|---|---|
| Purpose | Provide a durable database-enforced business operation identity for exactly-once cancellation stock recovery and audit |
| Tables affected | Preferred: one new inventory movement ledger; existing `orders`, `order_items`, `products`, and possibly existing `stock_history` are transaction participants. Minimal alternative: one dedicated recovery-marker table. Exact names are unapproved |
| Columns | Conceptually operation kind/key, order reference, order-item/product reference, quantity, stock before/after, movement type `RETURN`, actor, timestamps, and posting/outcome fields only if approved. These are not schema declarations |
| Constraints | Primary key plus unique deterministic business operation identity; positive quantity/check semantics; required references for automatic recovery. Exact constraints await technical approval |
| Indexes | Unique operation identity; expected order/order-item/product and reconciliation access paths. Exact index set requires query plan and catalog review |
| FK | Candidate references to `orders`, `order_items`, `products`, and actor/user. Delete actions must preserve audit and account for nullable/deleted products; no FK policy is assumed |
| Data migration | Prefer none. Never infer that historical `CANCELLED` orders were or were not restocked; historical reconciliation/manual classification is a separate approved project |
| Rollback strategy | Expand/disable rather than destructive rollback: stop new route writes, preserve ledger/audit, deploy forward fix. Within a request, rollback order, stock, operation, and audit atomically |
| Lock risk | New table/index/FKs are additive but may acquire catalog/relation locks and FK validation scans; modifying existing `stock_history` would increase risk and is not recommended without complete metadata |
| Compatibility | Preserve existing `stock_history` and old readers. Eliminate direct client order writes before authoritative activation; dual writers are unsafe. Adapter/dual-audit behavior must be explicit |
| Rehearsal requirement | Disposable non-Production DB with representative null/missing/inactive products and existing orders; prove unique claim, duplicate/concurrent behavior, webhook/payment race, all-or-nothing rollback, FK behavior, and application compatibility |
| Approval requirement | Business policy approval, technical ledger/marker approval, complete relevant metadata review, successful rehearsal evidence, migration approval, then separate Production execution approval |

### Technical selection gate

Option A (`stock_history` only) fails exactly-once because no evidenced durable order/operation unique key exists. Option B (dedicated marker) is viable for a narrowly approved one-recovery scope. Option C (dedicated movement ledger) has the strongest audit/reconciliation/reporting model and is preferred by FASE 2.49.

```text
TECHNICAL RECOMMENDATION = PENDING EXPLICIT APPROVAL
PREFERRED CANDIDATE = DEDICATED INVENTORY MOVEMENT LEDGER
FALLBACK CANDIDATE = DEDICATED DURABLE RECOVERY MARKER
CURRENT stock_history ONLY = NOT ACCEPTABLE FOR AUTOMATIC RESTOCK
```

No table, column, index, FK, enum, or executable DDL is created by this design.

## 4. Separation and release ordering

1. Do not combine Migration A and Migration B into one artifact or approval request.
2. Each must have an independent checksum, owner, review, rehearsal report, rollout/disable plan, and approval record.
3. Migration A may not be represented as cancellation readiness.
4. Migration B may not be represented as checkout readiness.
5. Cancellation application activation also requires approved business policy and removal/disablement of direct browser writes; schema presence alone is insufficient.

## 5. Disposable non-Production rehearsal plan

**Current rehearsal status: `BLOCKED` because no disposable database is evidenced.** This document does not create one and does not request Production credentials.

When an authorized disposable non-Production database is supplied through established secure environment management, rehearse each migration independently:

### Preparation and safety

1. Confirm the target is disposable and non-Production using approved environment controls; operators must not print connection strings/secrets.
2. Record engine/version/extensions and a catalog-only pre-state. Use synthetic or approved sanitized representative data, never Production secrets/PII/payment payloads.
3. Capture row-count/constraint compatibility evidence and application versions. Establish timeout, abort, and cleanup procedures.
4. Review SQL offline before execution. Execution requires explicit non-Production rehearsal authorization even though Production approval is not involved.

### Required rehearsal cases

| Requirement | Migration A | Migration B |
|---|---|---|
| Schema creation | Artifact creates only intended checkout object | Approved candidate creates only intended additive recovery objects |
| Existing data compatibility | Existing user/order FK shapes and nullable order links | Existing order/item/product/null/deleted/inactive cases classified without inferred backfill |
| FK compatibility | Insert valid/invalid references and test intended delete behavior | Test every approved reference/delete behavior while preserving audit |
| Unique constraint | Duplicate checkout key/order claim rejected | Duplicate operation tuple rejected |
| Duplicate operation | Same request returns/reuses one checkout outcome | Duplicate cancel causes no second stock increment/movement |
| Rollback | Forced checkout failure leaves no partial order/claim | Forced failures at each step leave no partial order/stock/movement/audit |
| Transaction behavior | Claim/order creation atomicity | Guard/claim/state/stock/audit atomicity |
| Concurrency | Parallel same-key checkout has one winner | Parallel cancel has one recovery; cancel/webhook/payment races reconcile safely |
| Application compatibility | Old version remains safe; new version handles absent/present table by rollout contract | Reads remain compatible; direct writer disabled before authoritative server route activation |

### Rehearsal evidence and exit criteria

- Capture command versions, artifact checksums, timings, lock observations, test output, pre/post catalogs, and sanitized failure evidence.
- Demonstrate clean setup from scratch and the approved rollback/disable procedure.
- Demonstrate repeated execution behavior appropriate to the migration tool; never use `migrate resolve` to hide a failed rehearsal.
- Require all compatibility, duplicate, concurrency, and rollback tests to pass with no unexplained drift.
- Destroy the disposable environment through its authorized owner/process after evidence retention; this repository does not automate database creation or destruction.

Failure of any criterion leaves that migration `BLOCKED`; it must not be promoted by waiver implicit in another approval.

## 6. Application activation dependencies

The future `POST /api/admin/orders/[id]/cancel` route may be coded/tested against the approved disposable schema only after business and technical decisions are explicit. Activation requires:

- Supabase authentication, `public.users` mapping, `role=admin`, and `isActive=true` enforced server-side;
- approved fulfillment/payment allowlists, with paid/refund behavior settled;
- deterministic unique cancellation-return operation identity;
- one guarded database transaction for order, inventory, movement/marker, and atomic audit;
- no automatic recovery for null/deleted product references; inactive-product behavior approved;
- direct client mutation at `src/app/admin/page.tsx:361` removed or disabled in a coordinated non-destructive application change;
- sanitized `401/403/404/409/422/500/503` behavior and the complete non-Production test contract passing.

Schema migration alone must never enable cancellation.

## 7. Approval matrix

| Gate | Required evidence | Current result |
|---|---|---|
| BUSINESS APPROVAL | Signed actor/status/payment/refund/manual-review policy | **NOT APPROVED** |
| TECHNICAL APPROVAL | Selected ledger/marker, operation scope, atomic flow, API/test review | **NOT APPROVED** |
| MIGRATION APPROVAL | Complete relevant catalog, reviewed artifact, successful disposable rehearsal | **NOT APPROVED** |
| PRODUCTION EXECUTION APPROVAL | Exact artifact/checksum, window, operator, monitoring, backup/disable/rollback plan | **NOT APPROVED** |

These approvals are independent and non-transitive.

## 8. Final readiness gate

```text
BUSINESS POLICY = REQUIRE DECISION
CANCELLATION DESIGN = PASS (design only) / BLOCKED (implementation)
REFUND DESIGN = BLOCKED
INVENTORY DESIGN = PASS (options/recommendation documented; selection pending)
EXACTLY-ONCE DESIGN = PASS (future design) / BLOCKED (current schema)
ADMIN SERVER CONTRACT = PASS (design only)
MIGRATION DESIGN = PASS (two independent future migrations documented)
REHEARSAL PLAN = PASS (design) / BLOCKED (disposable database unavailable)
TEST CONTRACT = PASS (design only)

PRODUCTION TOUCHED = NO
PRODUCTION DATA CHANGED = NO
PRODUCTION SCHEMA CHANGED = NO
MIGRATION EXECUTED = NO
DEPENDENCY CHANGED = NO
SECRETS CHANGED = NO
DATABASE_URL CHANGED = NO
DIRECT_URL CHANGED = NO
COMMIT = NO
PUSH = NO

BASELINE READY = NO
CHECKOUTIDEMPOTENCY = NOT EXECUTED
CANCELLATION MIGRATION = NOT EXECUTED
```

**CRITICAL BLOCKERS:** incomplete Production metadata; absent business/refund approval; inventory architecture and operation scope not approved; current schema lacks an exactly-once invariant; no disposable non-Production database/rehearsal evidence; server route and race/rollback integration proof absent; unsafe direct browser order mutation remains.

**NEXT PHASE:** record explicit business and technical approvals, complete authorized catalog-only verification, provision an authorized disposable non-Production database, create/review Migration B only after schema selection, and rehearse Migration A and B separately. Production execution remains a later independent gate.

STOP.