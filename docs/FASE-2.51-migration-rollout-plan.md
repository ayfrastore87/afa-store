# FASE 2.51 — Migration Rollout Plan

**Rule:** two independent future migrations; neither was executed.

## Migration A — CheckoutIdempotency

The existing artifact `prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql` must not be modified. It remains `NOT EXECUTED` and is not approved by this document.

1. Confirm baseline/catalog prerequisite, ownership, table absence, and FK compatibility.
2. Rehearse on an isolated disposable non-Production database.
3. Obtain separate migration approval with artifact review/checksum.
4. Deploy the unchanged artifact in an approved non-Production-to-release process.
5. Verify table, primary/unique indexes, indexes, FKs, and application compatibility.
6. Enable checkout idempotency only after verification; retain an application disable switch.
7. Abort on unexpected objects, lock/latency impact, FK/index mismatch, duplicate claim failure, or unexplained drift. Do not hide failure with migration resolution.

No historical backfill is planned. Rollback after application use prefers disable/forward repair; dropping durable request evidence is not an automatic rollback.

## Migration B — InventoryMovement

1. Baseline prerequisite: complete approved catalog-only metadata verification and record explicit technical/business decisions.
2. Rehearse the conceptual schema, constraints, FKs, indexes, duplicate claims, concurrency, rollback, and old/new application compatibility on a disposable target.
3. Author a separate additive schema artifact only after ledger design approval; review exact physical types and FK actions.
4. Verify unique line operation identity, required product/order/order-item references, index plans, ownership, grants/RLS, and lock behavior.
5. Obtain independent migration approval; deploy only the reviewed artifact.
6. Roll out server cancellation code dark/disabled first; verify observability and error classification.
7. Enable cancellation only after business policy, payment/refund behavior, and integration tests pass.
8. Monitor duplicate conflicts, rollback errors, stock reconciliation, orphan movements, latency, and payment/webhook races.
9. Abort on any partial commit, duplicate stock increment, FK/constraint mismatch, unsafe authorization, reconciliation drift, or unexplained lock/error rate. Disable application behavior and reconcile; do not casually drop ledger evidence.

## Dependency order

The migrations are **independent at schema level**: Migration A concerns checkout request identity, while B concerns cancellation inventory operations. They must not be bundled. A may be deployed before B if checkout rollout is ready, but B does not depend on A and B cannot repair checkout idempotency. If release sequencing requires one order, use `A → B` for operational isolation, with separate approvals, rehearsals, artifacts, verification, and activation gates.

```text
Migration A: NOT EXECUTED
Migration B: NOT AUTHORED / NOT EXECUTED
Production migration approval: NOT GRANTED
```