# FASE 2.51 — Technical Approval

**Level:** Principal Engineer
**Mode:** design freeze + non-Production rehearsal preparation
**Date:** 2026-09-09
**Scope:** technical recommendation only; no business or Production approval

## 1. Safety boundary

This phase performs documentation only. No Production connection, SQL, migration, schema/data change, dependency, secret, environment, commit, or push was performed. `prisma/schema.prisma` and `prisma/migrations/` remain unchanged. No database target was available that could be proven disposable and non-Production; rehearsal is therefore blocked.

## 2. Final option evaluation

| Option | Exactly-once | Concurrency | Audit/reconciliation/reporting | Future operations | Rollback | Complexity/compatibility | Result |
|---|---|---|---|---|---|---|---|
| A. Existing `stock_history` only | Fails: no evidenced business unique key or durable order reference | Atomic stock can be guarded, but duplicate recovery is not prevented | Useful audit vocabulary, weak reconciliation identity | Limited and legacy-shaped | Application compensation only | Lowest migration cost, but metadata/ownership incomplete | Reject as sole mechanism |
| B. Durable recovery marker | Can prevent duplicate cancellation if correctly unique | Good for a single operation, less expressive for multiple movements | Adequate event existence, weak movement reporting | Requires another model for future movements | Simple disable/forward repair | Smaller schema, but splits operation and movement audit | Viable fallback |
| C. Dedicated inventory movement ledger | Database-enforced unique operation identity | One claim plus guarded stock update in one transaction | Strong durable audit, reconciliation, and reporting | Supports `SALE`, `RETURN`, `IN`, `OUT`, `ADJUSTMENT` | Disable route; preserve committed evidence and reconcile | Additive table; requires careful FK/index rehearsal | **Recommended** |

## 3. Technical recommendation

Select **Option C — dedicated `InventoryMovement` ledger**. It is the only option that combines a durable exactly-once business-operation identity with a useful movement history and an extensible inventory vocabulary. Existing `stock_history` remains compatibility/audit context; it is not the deduplication authority.

The authoritative recovery identity is line-level: `operationKind + orderId + orderItemId`. An order-level uniqueness rule may be added as an aggregate completeness invariant only if the business guarantees one movement per order; it must not replace line-level identity because multiple lines and repeated products are valid cases.

This recommendation is **not technical approval** and does not imply business approval, migration approval, or Production execution approval.

## 4. Frozen decisions and open approvals

- `SALE` represents checkout stock decrement; `RETURN` represents cancellation recovery.
- Existing types `IN`, `OUT`, `SALE`, `RETURN`, and `ADJUSTMENT` are retained; no new status/type is invented.
- Product identity is always `products.id`; name, price, image, slug, or quantity cannot substitute for it.
- Null `OrderItem.productId` and missing/deleted product require manual review and no automatic restock.
- Inactive-product behavior remains a business decision.
- Paid cancellation/refund remains blocked and no refund implementation is authorized.
- Cancellation remains unimplemented until explicit business and technical approvals are recorded.

## 5. Gate

```text
TECHNICAL RECOMMENDATION = INVENTORY LEDGER
TECHNICAL APPROVAL = REQUIRE REVIEW
BUSINESS POLICY = REQUIRE DECISION
REFUND POLICY = REQUIRE DECISION
MIGRATION A DESIGN = PASS (design only; approval not granted)
MIGRATION B DESIGN = PASS (design only; artifact not created)
REHEARSAL = BLOCKED (no verified disposable database)
CANCELLATION IMPLEMENTATION = NOT YET APPROVED
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
```