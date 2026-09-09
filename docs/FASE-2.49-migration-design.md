# FASE 2.49 — Cancellation Migration Design

**Status:** design only; migration not approved and not executed.

## 1. Non-execution rules

No Production connection, SQL, `prisma migrate`, `prisma migrate deploy`, `prisma migrate resolve`, `prisma db push`, `prisma db pull`, `ALTER TABLE`, `CREATE TABLE`, `DROP TABLE`, `TRUNCATE`, environment change, secret change, dependency change, commit, or push occurred.

The Production baseline remains incomplete. Existing Production objects, including `stock_history`, are preserved and must not be recreated from Prisma inference.

## 2. Options comparison

| Option | DDL required | Exact-once guarantee | Risk/rollback | Compatibility | Complexity |
|---|---|---|---|---|---|
| 1. No schema change | none | No; `stock_history` has no evidenced dedup key | lowest migration risk; application correctness remains blocked | highest immediate compatibility | low |
| 2. Prisma model only | none if table exactly compatible; otherwise unsafe | No; mapping does not add deduplication | no DDL if verified; rollback is removing application mapping | depends on exact existing metadata | low-medium |
| 3. Durable cancellation/restock marker | add marker tied to order/operation, unique by business key | Yes, if unique constraint and guarded transaction are verified | backfill/duplicate audit required; rollback must not delete markers silently | requires order relationship and compatible privileges | medium-high |
| 4. Dedicated inventory movement ledger | create movement table with unique operation key, order/product references, quantities, actor, timestamps, status | Yes, with unique operation key and atomic claim/posting | largest data/DDL surface; additive rollback preferred; no destructive rollback | compatible through adapter/backfill; strongest auditability | high |

## 3. Option 1 — no schema change

The application could write `orders.status`, increment `products.stock`, and insert `stock_history RETURN`. This is not acceptable for the requested goal because:

- `cancelledAt` is not a recovery marker;
- `stock_history.id` is generated after insertion;
- no evidenced unique `(order, operation)` key exists;
- `stock_history` has no evidenced `order_id`;
- duplicate concurrent requests can both increment stock.

Recommendation: do not implement recovery under this option. It is useful only as a read/audit compatibility baseline.

## 4. Option 2 — Prisma model only

First obtain exact catalog evidence, then add a Prisma model mapping to the existing table if every type, nullability, identity, check, and permission is compatible. This enables typed reads/writes but does not add exactly-once semantics. It is an interoperability step, not a correctness solution.

No `StockHistory` model is added in FASE 2.49.

## 5. Option 3 — dedicated marker

Minimal future design:

```text
order_id / operation key: unique
restock status: claimed or completed
created_by, created_at, completed_at: audit fields
```

The unique business key must be defined before DDL. A likely invariant is one cancellation recovery operation per order, but that requires business approval for retries, partial/manual review, and re-cancellation. The marker must be claimed in the same transaction as the guarded order transition and stock increment.

This option is smaller than a ledger but may be insufficient for per-item exceptions, reconciliation, and multiple future inventory movements.

## 6. Option 4 — inventory movement ledger

Preferred long-term design:

```text
movement_id / operation_id: unique
order_id: nullable or required by movement category
product_id: required for automatic product movement
movement_type: existing-compatible SALE or RETURN vocabulary
quantity, stock_before, stock_after
status: claimed/posted/reversed, if policy requires
actor, note, created_at
```

The existing `stock_history` table can remain the historical/audit compatibility table, while the new ledger supplies durable business identity. Whether both rows are required must be decided before migration. The transaction must atomically claim the unique operation, lock/guard the order state, update product stock, and post the movement. Reconciliation can then detect missing or duplicate effects.

No enum is added in this phase, and no executable DDL is supplied.

## 7. Data risk and rollback

- Never backfill a recovery marker by assuming every existing `CANCELLED` order was or was not restocked.
- Existing order/item/product data requires an audit report before any backfill.
- Existing duplicate/manual `RETURN` rows must be identified before a unique constraint is considered.
- Additive migration is preferred; rollback should disable new application writes, not delete audit or movement history.
- A failed transaction must roll back order state, product stock, and movement/marker claim together.
- No migration is safe while Production metadata remains incomplete.

## 8. Downtime and compatibility

An additive marker/ledger can potentially be deployed with an expand/contract sequence, but only after catalog verification, permission/RLS review, backfill strategy, and isolated rehearsal. Existing clients must stop direct order status mutation before the server route becomes authoritative. During transition, dual writers would be unsafe unless explicitly coordinated.

The current admin client must not be switched to a partial server route before the exact-once invariant is available.

## 9. CheckoutIdempotency gate

`CheckoutIdempotency` migration is also **not approved and not executed**. It must not be reused as a cancellation/restock marker because checkout request identity and inventory recovery operation identity are different domains.

## 10. Recommendation

1. Do not implement Option 1 recovery.
2. Use Option 2 only after exact catalog compatibility is verified, for typed stock-history interoperability.
3. Prefer Option 4 dedicated inventory movement ledger for durable exactly-once recovery; use Option 3 only if the business scope is permanently one recovery operation per order and no richer inventory audit is needed.
4. Obtain business approval for customer cancellation and paid-order refund handling.
5. Rehearse an additive migration in an isolated non-Production database.
6. Implement the server route only after the unique operation invariant, transaction behavior, and concurrency tests pass.

## 11. Migration gate

```text
MIGRATION APPROVED = NO
BASELINE READY = NO
CHECKOUTIDEMPOTENCY MIGRATION = NOT EXECUTED
CANCELLATION MIGRATION = NOT EXECUTED
PRODUCTION TOUCHED = NO
PRODUCTION DATA CHANGED = NO
PRODUCTION SCHEMA CHANGED = NO
```

**Next phase:** catalog-only verification and isolated migration rehearsal, followed by explicit business approval. No Production migration until the baseline is complete and approved.