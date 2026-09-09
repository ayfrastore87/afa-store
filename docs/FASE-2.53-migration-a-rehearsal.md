# FASE 2.53 — Migration A Rehearsal Plan

**Artifact:** `prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql`
**Required SHA-256:** `8290669ccc69fd9c37edaf6279c0c636550ccc7d93021ad3f6b85e40382c242c`
**Current mode:** plan only; no database connected and no migration executed
**Current result:** `BLOCKED`

## 1. Entry gates

Run this rehearsal only on an independently verified disposable non-Production PostgreSQL database. Before execution: recheck the artifact checksum; capture the prerequisite `users.id` and `orders.id` types/uniqueness; prove the target contains synthetic data only; confirm object-name absence; and define explicit teardown. Stop on any mismatch. Never use Production credentials or existing application URLs as fallback.

The artifact must be applied byte-for-byte as reviewed. Do not edit it to make a failed rehearsal pass. This plan does not grant migration approval.

## 2. Schema and constraint matrix

| Test | Procedure on future disposable target | Expected evidence |
|---|---|---|
| Table creation | Apply the exact checksum-pinned artifact after compatibility precheck | `CheckoutIdempotency` exists with the ten reviewed columns and exact nullability/defaults |
| Primary key | Inspect catalog and attempt duplicate `id` in a rollback-scoped test | `CheckoutIdempotency_pkey(id)`; duplicate rejected |
| Unique key | Insert two rows with the same `key` | `CheckoutIdempotency_key_key(key)` rejects the second row |
| Nullable `orderId` | Insert multiple rows with `orderId = NULL`, then two rows referencing one order | Multiple nulls accepted; duplicate non-null order rejected |
| Users FK | Inspect action/type; test valid, missing, update, and deletion behavior using synthetic users | FK references `users(id)`, update CASCADE and delete CASCADE exactly as artifact |
| Orders FK | Inspect action/type; test valid, missing, update, and deletion behavior using synthetic orders | FK references `orders(id)`, update CASCADE and delete SET NULL exactly as artifact |
| Indexes | Inspect catalog definitions | Unique indexes on `key` and `orderId`; indexes on `userId` and `(status, expiresAt)` |
| Rollback | Execute artifact in a disposable transaction/snapshot strategy and force failure before commit; separately exercise approved teardown | Failed transaction leaves no partial objects; teardown restores target only. Do not infer a Production down migration. |

Retention semantics (`users` CASCADE and `orders` SET NULL) require explicit acceptance even when the mechanical tests pass.

## 3. Runtime application matrix

These tests require the checkout service/harness, not only SQL schema inspection:

| Test | Stimulus | Expected result |
|---|---|---|
| Duplicate key, same hash | Replay the same authenticated request/key/payload after completion | One order; persisted completed response is replayed; no repeated stock/cart/payment effect |
| Request-hash mismatch | Reuse a key with a different canonical request hash | Conflict; original claim/result unchanged; no second order or stock effect |
| Response replay | Retry after a committed response, including after process restart | Stored sanitized response semantics are returned; no business logic re-execution |
| Concurrent same key | Barrier-synchronize two requests with identical key/hash | One durable winner; loser waits/re-reads or returns defined retry result; one order only |
| Concurrent key mismatch | Barrier-synchronize identical key with divergent hashes | At most one payload wins; other conflicts; no cross-payload replay |
| Stock concurrency | Different valid keys compete for last synthetic stock | Conditional stock mutation prevents oversell; losing transaction has no partial order |
| Transaction rollback | Inject failure after claim, stock change, order creation, response persistence, and before commit | Claim, stock, order, cart/payment-related transaction state all roll back atomically |

Capture sanitized request identifiers, transaction outcomes, relevant row counts, stock before/after, and catalog definitions. Never capture credentials or business/Production data.

## 4. Exit criteria

PASS requires every schema test and applicable runtime test to pass on the verified disposable target, no checksum drift, no unexplained locks/drift, retained sanitized evidence, and successful teardown verification. Schema-only success cannot satisfy request-hash mismatch, response replay, concurrency, or transaction rollback proof.

```text
MIGRATION A REHEARSAL = BLOCKED
SCHEMA TESTS = NOT RUN
DUPLICATE KEY = NOT RUN
REQUEST HASH MISMATCH = NOT RUN
RESPONSE REPLAY = NOT RUN
RUNTIME CONCURRENCY = BLOCKED
RUNTIME ROLLBACK = BLOCKED
MIGRATION EXECUTED = NO
```