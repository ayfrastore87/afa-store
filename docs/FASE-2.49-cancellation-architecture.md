# FASE 2.49 — Cancellation Architecture & Migration Design

**Mode:** DESIGN + APPLICATION PREPARATION / NON-PRODUCTION
**Date:** 2026-09-09
**Production access:** none

## 1. Scope and safety gate

This phase designs a durable cancellation path. It does not implement cancellation, restock, schema changes, migrations, SQL execution, Production access, dependency changes, environment changes, commit, or push.

FASE 2.48 findings remain accepted:

- customer cancellation is not active;
- admin status mutation is direct client-side Supabase update;
- no server-side guarded transition, cancellation transaction, stock recovery, or concurrency protection exists;
- checkout is the sale stock decrement;
- `cancelledAt` is not an exactly-once marker;
- `stock_history` exists in Production but is not a Prisma model;
- `OrderItem.productId` is nullable;
- exactly-once restock is currently **BLOCKED BY SCHEMA CAPABILITY**.

## 2. Evidence boundary

Verified design evidence supplied for Production `stock_history`:

| Field | Production evidence |
|---|---|
| `id` | `GENERATED ALWAYS AS IDENTITY` |
| `product_id` | present |
| `product_name` | present |
| `transaction_type` | present |
| `quantity` | present |
| `stock_before` | present |
| `stock_after` | present |
| `note` | present |
| `created_by` | present |
| `created_at` | present |

Verified `transaction_type` check values are: `IN`, `OUT`, `SALE`, `RETURN`, and `ADJUSTMENT`.

The Production schema manifest remains incomplete. No unverified index, unique constraint, RLS policy, ownership, foreign key, or trigger is inferred here. The existing `stock_history.id` identity is not an idempotency key.

## 3. Existing direct mutation to replace

Current path:

```text
admin browser
  -> supabase.from("orders").update(orderPatch).eq("id", order.id)
  -> orders.status / orders.cancelledAt
```

The current client accepts arbitrary status values, does not guard the source status server-side, and does not update stock. It must not be extended to perform restock.

The replacement path is:

```text
admin browser
  -> POST /api/admin/orders/[id]/cancel
  -> getCurrentAdmin()
  -> cancellation service
  -> one database transaction
  -> guarded order transition + durable restock movement
```

The client should only display the server result and reload the order. It must not write `orders`, `products`, or `stock_history` directly.

## 4. Proposed server endpoint contract

### `POST /api/admin/orders/[id]/cancel`

Request body should be minimal and non-authoritative, for example an optional reason. The server owns the cancellation timestamp, actor identity, source-state check, payment policy, product identity, quantity, stock arithmetic, and history values.

Expected responses:

| Condition | HTTP result |
|---|---:|
| no authenticated active admin | `403` |
| malformed id/body | `400` |
| order absent | `404` |
| source status not cancellable | `409` |
| paid order without approved refund path | `409` / policy-specific blocked result |
| null/missing product reference | transaction must not restock; manual-review result |
| first successful cancellation | `200` |
| idempotent repeat after completed cancellation | `200` with same cancellation result, only if durable marker exists |
| transaction failure | `500`, with no committed cancellation or stock recovery |

### Application service pseudocode

```text
cancelOrderAsAdmin(orderId, actor):
  require actor is authenticated, role=admin, isActive=true
  begin transaction

  load order, payment, and order items
  atomically claim the order transition:
    UPDATE orders
    SET status='CANCELLED', cancelledAt=now()
    WHERE id=orderId AND status IN (approved cancellable states)

  if zero rows changed:
    read current state
    return already-cancelled only when durable recovery state proves completion
    otherwise return conflict

  enforce payment cancellation/refund policy
  for each item:
    if productId is null: do not restock; mark manual exception policy
    if product does not exist: do not restock; mark manual exception policy
    lock/guard product row and increment stock
    write RETURN movement with the same transaction

  commit
```

This pseudocode is intentionally **not implementable safely against the current schema**. In particular, the order guard and product row update do not provide exactly-once recovery unless the durable movement claim is also atomic and uniquely deduplicated.

## 5. Status transition design

The future API must use an allowlist and a server-side conditional update. The exact business allowlist requires approval. A conservative candidate is:

```text
PENDING -> CANCELLED
PROCESSING -> CANCELLED only if business policy explicitly permits it
PACKED/SHIPPED/COMPLETED -> BLOCKED by default
CANCELLED -> idempotent replay only after recovery completion is durably proven
```

The current admin UI does not prove any of those transitions. Therefore the status-transition gate is **BLOCKED until policy and durable recovery are approved**.

## 6. Customer cancellation policy

Customer cancellation must not be implemented in this phase.

Required business decisions:

1. Are customers allowed to cancel at all?
2. From which fulfillment states?
3. Does payment state change eligibility?
4. Does a paid order require refund before or after cancellation?
5. Who is the refund authority: Midtrans/provider, finance/admin workflow, or another service?
6. Is cancellation allowed after packing, shipment, or completion?

Until answered: **REQUIRE BUSINESS POLICY**. No customer endpoint or UI action is added.

## 7. Payment interaction

Only existing canonical payment states are used by this design: `PENDING`, `PAID`, `EXPIRED`, and `CANCELLED`. `WAITING_PAYMENT` is retained as legacy/default order vocabulary only. `FAILED`, `REFUNDED`, and `WAITING_CONFIRMATION` are not added or treated as canonical states.

| Payment state | Cancellation design |
|---|---|
| `PENDING` | potentially cancellable if fulfillment policy allows; no refund claim |
| `PAID` | blocked unless approved refund workflow exists |
| `EXPIRED` | policy decision required; no automatic restock assumption |
| `CANCELLED` | payment terminal state; order recovery still requires its own durable proof |
| `REFUNDED` | not an existing state; do not use |

The existing payment transition logic rejects paid-state downgrade and requires reconciliation for late events. Cancellation must not claim refund automation. If payment is `PAID` and refund is unavailable, cancellation/recovery is **BLOCKED**.

## 8. Product identity policy

Restock identity is `OrderItem.productId` only. Product name, price, subtotal, SKU-like display text, or historical name must never identify inventory.

| Product condition | Policy |
|---|---|
| valid `productId`, product exists | candidate for atomic stock recovery |
| `productId IS NULL` | do not restock automatically; manual review exception |
| product exists but `isActive=false` | identity remains valid; recovery may be allowed only by approved policy; inactive does not mean missing |
| product record missing | do not restock automatically; manual review exception |

Partial recovery is unsafe unless the transaction has a durable per-item recovery state. Without that, the service must fail closed rather than recover only some items.

## 9. Exactly-once decision

Existing `stock_history` **cannot guarantee exactly-once restock without schema change**.

Formal reason:

1. Existing `stock_history.id` is database-generated and unknown before insertion.
2. The table has no evidenced unique key on `(order_id, transaction_type)`; indeed `order_id` is not among the verified existing columns.
3. The existing table has no cancellation/restock operation identifier.
4. `orders.cancelledAt` is nullable timestamp data and cannot represent recovery claim/completion.
5. Two concurrent requests can both observe an eligible order, increment stock, and insert two valid `RETURN` rows unless a unique database constraint or atomic claim prevents the second operation.
6. A transaction alone serializes statements within one transaction; it does not deduplicate independent transactions without a guarded state plus durable unique movement key.
7. A generated history id detects neither a duplicate request nor the relationship to the order.

Therefore Option A can provide an audit row, but not a proof of exactly-once recovery under the evidenced schema. Recommendation: **Option B / future dedicated durable marker or movement ledger**.

## 10. Test matrix

| Test | Expected future behavior | Current state | Future design |
|---|---|---|---|
| admin cancel `PENDING` | one guarded cancellation and one recovery | direct client update; no recovery | server transaction + unique operation |
| admin cancel `PROCESSING` | policy-controlled; no implicit approval | arbitrary client status write | explicit allowlist |
| cancel terminal order | reject with conflict | not guarded | conditional state transition |
| duplicate cancel | idempotent result, no second stock effect | not provable | durable marker/ledger |
| concurrent cancel | one winner, one no-op/conflict | not safe | unique claim + guarded order state |
| cancel + webhook | one authoritative outcome; no downgrade | not jointly guarded | transaction/policy coordination |
| cancel + payment update | paid/refund policy enforced | no cancellation service | payment state check in transaction |
| valid product restock | increment exact product and write `RETURN` | no recovery | product-id-only movement |
| null `productId` | no automatic restock; manual exception | no recovery | fail closed |
| inactive product | identity preserved; policy decides | no recovery | never use inactivity as identity |
| missing product | no automatic restock; manual exception | no recovery | fail closed |
| stock history | atomic audit row with recovery | admin writes separately | same transaction after durable claim |
| transaction rollback | no order, stock, or movement partial commit | no cancellation transaction | one database transaction |
| unauthorized admin | `403`; no writes | current page gate exists, route absent | `getCurrentAdmin()` in API |
| inactive admin | `403`; no writes | server helper returns null | same server guard |

The matrix is a design artifact, not a claim that the future behavior is currently implemented or runtime-proven.

## 11. Final gate

```text
CANCELLATION ARCHITECTURE = PASS (design only; implementation blocked)
EXACTLY-ONCE DESIGN = BLOCKED on current schema / PASS as future design
STOCK HISTORY DESIGN = PASS (design only; current table lacks dedup proof)
NULL PRODUCT POLICY = PASS (fail closed/manual review)
PAYMENT POLICY = BLOCKED pending refund/business policy
ADMIN SERVER API DESIGN = PASS (not implemented)
MIGRATION DESIGN = PASS (not approved/executed)
TEST MATRIX = PASS (documented)

PRODUCTION TOUCHED = NO
PRODUCTION DATA CHANGED = NO
PRODUCTION SCHEMA CHANGED = NO
MIGRATION EXECUTED = NO
DEPENDENCY CHANGED = NO
SECRETS CHANGED = NO
COMMIT = NO
PUSH = NO

BASELINE READY = NO
CHECKOUTIDEMPOTENCY MIGRATION = NOT EXECUTED
CANCELLATION MIGRATION = NOT EXECUTED
```

**Critical blockers:** missing durable unique recovery identity; incomplete Production metadata; no approved customer cancellation/refund policy; no server cancellation route; no safe local runtime concurrency database.

**Next phase:** approve business/payment policy, obtain authorized catalog-only verification of all required Production constraints/indexes/RLS, select Option B, create isolated migration rehearsal, then implement the server route and transaction with concurrency tests. Stop before any Production migration until the baseline gate is approved.