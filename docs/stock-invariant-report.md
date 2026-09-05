# AFA STORE — Stock Invariant Report

**Scope:** static re-audit; no stock restoration or database operation was performed.

## Mutation map

| Flow | Stock behavior | Finding |
|---|---|---|
| Checkout | Conditional `updateMany` with `stock >= qty`, then atomic decrement inside the order transaction | Sole observed sale decrement path |
| Webhook | Payment/order transition only | Zero stock mutation |
| Completion | Admin updates fulfillment status/timestamp only | Zero additional sale decrement |
| Cancellation | Status/timestamp only | No restoration (explicitly deferred) |
| Expiration | Payment/order state transition only | No restoration |
| Admin stock controls | Read-compute-write absolute stock, then separate `stock_history` insert | Manual adjustment; race-prone and non-atomic |
| `stock_history` | Separate Supabase insert after admin product update | Audit can be missing even when stock commits |

## Proven static invariants

1. A successfully committed checkout decrements each ordered product once in the same transaction that creates Order, OrderItem, Payment, CheckoutHistory, and completes its idempotency record.
2. A failure after decrement but before transaction commit rolls back all transaction writes by PostgreSQL transaction semantics.
3. The `stock >= qty` predicate and atomic decrement prevent the checkout sale path from committing negative stock. For initial stock 1 and qty 1, at most one concurrent conditional update can succeed.
4. Duplicate webhook delivery cannot decrement stock because webhook code contains no stock mutation.
5. Completion cannot decrement stock a second time because its admin path contains no stock mutation.
6. Cancellation/expiration restoration is intentionally absent, so the current invariant is reservation-as-sale at checkout, not reversible inventory allocation.

These are static/code-level proofs; real concurrency confirmation remains blocked without isolated PostgreSQL.

## Risks

- Both admin implementations compute `nextStock` from a stale client snapshot and write an absolute value. Concurrent admin/admin or admin/checkout operations can lose updates or overwrite a checkout decrement.
- Client-side `Math.max(0, ...)` is not a database invariant; another writer can bypass it.
- Product update and history insertion are separate operations, so they are not atomic.
- There is no reviewed stock ledger/idempotency key for manual adjustments.

Recommended future work is a server-side transactional adjustment operation with conditional arithmetic update, authorization, and history insertion in the same transaction. It must be a separate approved change; restoration policy remains out of scope.