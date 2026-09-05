# FASE 2.36 — PRODUCTION METADATA EVIDENCE + DISPOSABLE POSTGRES CONCURRENCY GATE

**Project:** AFA STORE
**Date:** 2026-09-06
**Final decision:** **BLOCKED**
**Production:** **NOT READY**
**This phase is not a migration. No Production migration is allowed.**

## 1. Status

- **BASELINE EVIDENCE: BLOCKED** — no approved Production metadata evidence was supplied.
- **INTEGRATION TEST: BLOCKED** — no disposable PostgreSQL runtime/identity could be verified.
- No database connection, introspection, DDL/DML, Production business-row read, configuration change, dependency change, commit, or push occurred.

## 2. Production metadata evidence

No Supabase dashboard metadata/export, explicitly approved SQL Editor metadata-only result, or approved read-only metadata-tool output was available. Local Prisma and SQL files are historical/intended artifacts only. They were not used to manufacture Production facts. No `prisma db pull` was run and no Production target was contacted.

## 3. Exact schema inventory

The evidence ledger is [`production-schema-inventory.md`](production-schema-inventory.md). All unobserved table membership, columns, constraints, indexes, triggers, functions, views, sequences, types, dependencies, `_prisma_migrations` existence, and `CheckoutIdempotency` existence remain `UNKNOWN`. The required `public.users.auth_id -> auth.users.id` FK is also `UNKNOWN` until evidenced.

## 4. Hybrid ownership

**OPTION D — HYBRID retained.** Application-owned scope is the evidenced `public` business schema. `auth.users` is **SUPABASE-MANAGED / EXTERNAL** and excluded from application baseline ownership. `stock_history` remains `UNKNOWN`. A future baseline is historical migration state only; it must not recreate existing Production tables. See [`production-baseline-plan.md`](production-baseline-plan.md).

## 5. CheckoutIdempotency artifact verification

Artifact: `prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql`
Observed SHA-256: `8290669ccc69fd9c37edaf6279c0c636550ccc7d93021ad3f6b85e40382c242c`
Expected SHA-256: `8290669ccc69fd9c37edaf6279c0c636550ccc7d93021ad3f6b85e40382c242c`
Result: **MATCH**.

Static review confirms it only creates the new table, indexes, and FKs to existing `users`/`orders`; it does not alter existing business tables, touch `auth.users`, migrate existing data, use `IF NOT EXISTS`, or add manual retry logic. **NOT EXECUTED.**

## 6. Disposable PostgreSQL verification

Read-only PATH audit found no `psql`, `postgres`, `docker`, or `podman`. No software was installed. No `TEST_DATABASE_URL` target could be safely authenticated as disposable, isolated, distinct from `DATABASE_URL`, and non-Production. Credentials and URL values were not read or displayed.

**TEST TARGET VERIFIED: NO. FAIL CLOSED.** Host, port, database, user, and PostgreSQL version are therefore unavailable as safe evidence.

## 7. Twelve concurrency/recovery tests

All scenarios require real PostgreSQL transactions and synthetic fixtures. They were **NOT RUN**; static/unit tests are not substituted for database concurrency evidence.

| # | SCENARIO | SETUP | CONCURRENCY METHOD | EXPECTED | ACTUAL | RESULT | EVIDENCE |
|---|---|---|---|---|---|---|---|
| 1 | Same key + same payload | Synthetic user/cart/product | Simultaneous checkout transactions | Exactly one Order | NOT RUN | BLOCKED | No verified test DB |
| 2 | Same key + different payload | Same synthetic key, divergent body | Simultaneous requests | 409; no second Order | NOT RUN | BLOCKED | No verified test DB |
| 3 | Same key, different user | Two synthetic users | Simultaneous requests | Conflict; no cross-user access | NOT RUN | BLOCKED | No verified test DB |
| 4 | Different keys, same last stock | Stock=1 synthetic product | Simultaneous transactions | Only available quantity succeeds | NOT RUN | BLOCKED | No verified test DB |
| 5 | Quantity exceeds stock | Synthetic quantity > stock | Checkout transaction | Rollback; no partial Order | NOT RUN | BLOCKED | No verified test DB |
| 6 | Concurrent checkout, one unit | Stock=1 synthetic product | Barrier-synchronized transactions | No oversell | NOT RUN | BLOCKED | No verified test DB |
| 7 | PROCESSING retry | Synthetic PROCESSING record | Retry during/after first request | Defined response; no duplicate | NOT RUN | BLOCKED | No verified test DB |
| 8 | Provider success after timeout | Synthetic provider adapter | Timeout then retry/reconcile | No duplicate Order | NOT RUN | BLOCKED | No verified test DB |
| 9 | Duplicate settlement webhook | Synthetic signed payload | Simultaneous duplicate handlers | One transition; no stock mutation | NOT RUN | BLOCKED | No verified test DB |
| 10 | Webhook vs upload race | Pending synthetic payment | Simultaneous handlers | Valid transition wins; no downgrade | NOT RUN | BLOCKED | No verified test DB |
| 11 | Cancellation/expiration race | Pending/paid synthetic payment | Simultaneous status events | No PAID downgrade | NOT RUN | BLOCKED | No verified test DB |
| 12 | Cart cleanup race | Changed synthetic cart quantity | Checkout cleanup vs cart update | New quantity not accidentally deleted | NOT RUN | BLOCKED | No verified test DB |

## 8. Stock invariants

Real-PostgreSQL verification is **BLOCKED**. There is no evidence that successful checkout decrements exactly once under contention, retry adds zero decrement, webhook/completion add zero decrement, or failed checkout leaves zero permanent decrement. Static review still identifies checkout as the sole observed sale decrement path, but this is not concurrency proof. Any future invariant failure must stop the gate.

## 9. Idempotency recovery

Completed replay, same/different payload, concurrent same key, stale `PROCESSING`, provider/client timeout, and rollback behavior were not database-tested. Static implementation has `PROCESSING`/`COMPLETED` lifecycle and stored response payload, but real recovery, deterministic replay, stale-record reclamation, and expiry enforcement remain unproven. A stale `PROCESSING` record may block without durable recovery/reconciliation; required schema change is future work only.

## 10. Payment state machine

The canonical code model allows `PENDING -> PAID|EXPIRED|CANCELLED`; paid state rejects downgrade, fulfillment uses `PENDING -> PROCESSING -> PACKED -> SHIPPED -> COMPLETED`, and `Order.paymentStatus` is a projection. Unit validation is useful but real concurrent transaction behavior is **NOT TESTED**. Production persisted defaults/values remain unknown.

## 11. Webhook

Static code checks signature inputs, order identity, gross/payment amount, payment ownership, transaction identity, and conditional `PENDING` transition. Duplicate/concurrent behavior and race outcomes were not tested against PostgreSQL. No real Midtrans endpoint or Production webhook was called; no raw payment object was retained.

## 12. Cart merge

Real concurrent merge/update testing for `(user_id, product_ref)` uniqueness, lost updates, duplicate insert, quantity/stock caps, and rollback is **BLOCKED**. Current behavior remains exposed to unproven race handling; local historical SQL is not proof that the Production unique constraint exists.

## 13. Admin stock

Existing finding retained: the admin flow derives a new absolute stock value from a stale client snapshot and writes it separately from `stock_history`. Two admins can overwrite each other; history insertion can fail independently, producing incomplete audit history and inventory drift. Future remediation should be a server-authoritative atomic transaction with guarded stock mutation and history insertion. No Production change was made.

## 14. Payment proof

Current architecture writes to `public/uploads/payment-proofs` before the database transaction. Risks: public access, non-durable/serverless filesystem, orphaned file when transaction fails, and insufficient private access control. No real proof was read or uploaded. Future work requires private durable object storage plus authorized access and compensating cleanup; no migration is proposed here.

## 15. Migration readiness

- [ ] Approved exact Production metadata evidence
- [ ] Exact inventory and cross-schema dependency verified
- [ ] Hybrid ownership and historical baseline artifact operationally approved
- [x] CheckoutIdempotency migration hash/static artifact verified
- [ ] Disposable PostgreSQL identity verified
- [ ] Twelve real concurrency/recovery scenarios passed
- [ ] Stock and payment invariants passed under contention
- [ ] Reconciliation/recovery and durable payment-proof design approved
- [ ] Backup/PITR, rollback, monitoring, deployment order, and change procedure approved
- [ ] Separate Production migration approval

**Production migration remains prohibited in FASE 2.36.**

## 16. Blockers

1. Approved metadata-only Production export is unavailable.
2. Exact public inventory, `_prisma_migrations`, `CheckoutIdempotency`, and auth FK remain unverified.
3. No isolated disposable PostgreSQL runtime/identity is available; all 12 scenarios are unexecuted.
4. Stale idempotency recovery, deterministic replay/expiry, and durable reconciliation remain unproven.
5. Admin stock/history is race-prone and non-atomic.
6. Payment proofs use public, non-durable filesystem storage with orphan/access risks.
7. Operational approval for baseline, backup/PITR, rollback, monitoring, and deployment is pending.

## 17. Next phase

Obtain and review an approved metadata-only export; complete the exact ledger; approve the hybrid baseline artifact; provision an explicitly disposable PostgreSQL target with fail-closed `TEST_DATABASE_URL` guards; then implement and execute all synthetic concurrency/recovery tests. Document any required schema change separately. Do not run a Production migration until a later, separately approved gate.

## Validation record

- `node --test tests/*.test.mjs`: **PASS — 31/31**; one Node module-type warning, no failed tests.
- `npx prisma validate`: **PASS**.
- `npx tsc --noEmit`: **PASS**.
- `npx eslint .`: **PASS — 0 errors, 3 pre-existing warnings** (`Camera`, `storagePathFromPublicUrl`, and `Link` unused).
- `git diff --check`: **PASS**.

These validations are static/unit checks only. They do not alter the **BLOCKED** result for real PostgreSQL concurrency testing.