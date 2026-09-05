# FASE 2.35 — BASELINE EVIDENCE & ISOLATED CONCURRENCY GATE

**Project:** AFA STORE
**Date:** 2026-09-05
**Overall status:** **PARTIAL**
**Production status:** **NOT READY**

## 1. Ownership

**Selected strategy: OPTION D — HYBRID.** Public business tables are application-owned; `auth.users` and Supabase-managed schemas are external. Ownership details and prohibited operations are documented in [`schema-ownership.md`](schema-ownership.md). No schema was changed.

## 2. Production schema evidence

**BASELINE EVIDENCE — BLOCKED.** Available evidence is the FASE 2.34 supplied summary, existing Prisma schema, and historical Supabase SQL artifacts. No approved dashboard metadata export or read-only SQL metadata result was provided. No database connection, introspection, business-row SELECT, PII read, or `prisma db pull` occurred. Exact columns, defaults, constraints, indexes, triggers, functions, owners, and `_prisma_migrations` state therefore remain unverified.

## 3. Schema mapping

The complete evidence ledger is [`production-schema-inventory.md`](production-schema-inventory.md). It deliberately classifies unverified Production fields as `UNKNOWN`; the stated baseline reports 19 public tables, no `_prisma_migrations`, and missing `CheckoutIdempotency`. No mismatch was converted into a Prisma edit.

## 4. CheckoutIdempotency migration verification

Artifact: `prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql`
SHA-256: `8290669ccc69fd9c37edaf6279c0c636550ccc7d93021ad3f6b85e40382c242c` — **MATCH**.

Static review: artifact is unchanged; additive only; creates the new table, primary key, two unique indexes, two secondary indexes, and two FKs. It does not migrate existing data, alter existing business tables, modify `auth.users`, drop objects, or truncate data. It intentionally has no `IF NOT EXISTS`; repeated manual execution is unsafe and no retry logic was added. It was not executed.

## 5. Baseline strategy

[`production-baseline-plan.md`](production-baseline-plan.md) compares existing-schema baseline, Prisma artifact, external auth, and future Prisma chain. The current non-empty schema has no `_prisma_migrations`; `migrate deploy` is expected to return P3005 because Prisma has no accepted history for that schema. Objective: baseline already-existing application-owned public objects as history, exclude external auth, then append future migrations. No baseline was implemented.

## 6. PostgreSQL environment

Read-only PATH audit found no `psql`, `postgres`, `docker`, or `podman`. No software was installed, PATH/system configuration was changed, or database provisioned. A future harness must require `TEST_DATABASE_URL`, reject absence/equality with `DATABASE_URL`, production hosts/database names, and any `NODE_ENV` other than `test`; it must never fall back to `DATABASE_URL`.

**INTEGRATION TEST — BLOCKED.**

## 7. Real concurrency test results

**Not run — blocked by missing isolated PostgreSQL.** The requested 12 scenarios (stock-one, same/different/cross-user idempotency, duplicate/late webhook, rollback, invoice collision, cart ABA, upload/webhook race, provider timeout, and payment ownership) have no real DB result. Existing static tests are not substituted for concurrency evidence. Synthetic fixtures and deterministic teardown remain design requirements; no Production data may be copied.

## 8. Status default plan

[`status-default-cleanup-plan.md`](status-default-cleanup-plan.md) separates application compatibility, aggregate-only data audit/backfill, and a later schema-default migration. Legacy Prisma defaults are confirmed; checkout explicitly writes canonical `PENDING`. Persisted Production values are unknown because rows were not read. No schema default or data was changed.

## 9. Stock invariant

[`stock-invariant-report.md`](stock-invariant-report.md) confirms the sole sale decrement is the conditional transactional checkout update; webhook and completion perform zero stock mutation; checkout cannot commit a negative stock through its predicate. Admin absolute stock writes can race and `stock_history` is non-atomic. Static proof is complete; real concurrency proof is blocked.

## 10. Backup plan

Before any future migration: preserve approved metadata evidence, confirm restorable backup/PITR and owner, record this artifact hash and deployment commit. During: run only the exact approved migration once, monitor transaction/errors/locks, and stop on unexpected objects. After: perform metadata-only table/index/FK checks, application health checks, and no real checkout/payment. No backup was executed.

## 11. Rollback plan

Prisma migration rollback is not automatic. Use application rollback only when schema-compatible; prefer reviewed forward fixes. Leave an additive idempotency table in place rather than dropping it automatically. For catastrophe, stop rollout, preserve evidence, and use approved restore/PITR with a named recovery owner. Never blindly retry an uncertain migration or manually mark history applied.

## 12. Monitoring plan

Emit metric/log classifications: `checkout_created`, `checkout_idempotency_replay`, `checkout_processing_conflict`, `stock_insufficient`, `payment_paid`, `payment_expired`, `payment_cancelled`, `webhook_duplicate`, `webhook_amount_mismatch`, `webhook_transaction_mismatch`, `late_payment`, `reconciliation_required`, `payment_proof_rejected`, and `cart_cleanup_failure`.

Logs must contain classification, correlation/order identifiers where safe, outcome, latency, and retry state—not passwords, secrets, server keys, raw payment objects, payment proofs, or unnecessary PII. Alert on spikes in conflicts, rejected/mismatched webhooks, insufficient stock, cleanup failures, reconciliation backlog, and unknown payment transitions.

## 13. Migration readiness checklist

- [x] ownership strategy selected (approval still required)
- [ ] exact Production schema evidence
- [ ] baseline plan approved
- [x] CheckoutIdempotency artifact verified
- [x] migration hash verified
- [ ] isolated PostgreSQL available
- [ ] real concurrency tests passed
- [x] status cleanup plan documented
- [x] stock invariant statically reviewed
- [x] backup plan documented
- [x] rollback plan documented
- [x] monitoring plan documented
- [ ] durable reconciliation/outbox plan approved/implemented
- [ ] deployment order approved
- [ ] Production migration approval

**Gate result: NOT READY.**

## 14. Remaining blockers

1. Exact approved Production metadata evidence is unavailable.
2. Baseline ownership and artifact approval are not recorded.
3. No isolated PostgreSQL runtime is available; all real concurrency/recovery tests are blocked.
4. `CheckoutIdempotency` is absent from the stated Production baseline.
5. Legacy status/default data audit and backfill policy remain unexecuted.
6. Durable reconciliation/outbox and private durable payment-proof storage remain unimplemented.
7. Admin stock update and `stock_history` insertion are non-atomic and race-prone.

## 15. Exact FASE 2.36 recommendation

Obtain an approved metadata-only Production schema export and complete the inventory; approve the hybrid ownership/baseline artifact; provision a disposable PostgreSQL environment with fail-closed guards; implement and run the 12 synthetic concurrency/recovery scenarios; obtain aggregate status evidence and approve separate compatibility/backfill/default migrations; then conduct a formal backup, rollback, monitoring, reconciliation, deployment-order, and change-approval review. **Do not execute any Production migration before every checklist item is approved.**

## Validation and safety record

No migration command, `db pull`, `db push`, seed, reset, DDL, database connection, configuration/secret change, dependency change, commit, push, Production order, payment, or webhook was performed. The migration hash was checked locally.

- `node --test tests/*.test.mjs`: **PASS — 31/31**
- `npx prisma validate`: **PASS** (verified with the installed local executable after the `npx` wrapper exceeded the tool time limit)
- `npx tsc --noEmit`: **PASS**
- `npx eslint .`: **PASS — 0 errors, 3 pre-existing warnings** (`Camera`, `storagePathFromPublicUrl`, and `Link` unused; verified through the installed local executable)
- `git diff --check`: **PASS**