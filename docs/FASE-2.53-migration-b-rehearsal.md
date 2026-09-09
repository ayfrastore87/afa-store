# FASE 2.53 — Migration B Rehearsal Plan

**Subject:** conceptual `InventoryMovement` ledger
**Physical artifact:** `NOT AUTHORED`
**Current mode:** plan only; no database connected and no migration executed
**Current result:** `BLOCKED`

## 1. Entry gates

Do not author or run Migration B until all relevant Production catalog identity/type/FK evidence is verified, the ledger and line-level invariant receive technical approval, business policies are approved, a physical artifact is separately reviewed/checksummed, and an isolated disposable PostgreSQL target passes safety verification.

Required catalog evidence includes `order_items.id`, `order_items.productId`, `order_items.quantity`, `products.id`, `products.stock`, relevant PK/UNIQUE/FKs, and physical quantity/timestamp representation. Prisma and local Supabase SQL are not substitutes for Production catalog evidence.

## 2. Schema matrix

| Test | Future procedure | Expected proof |
|---|---|---|
| `InventoryMovement` schema | Compare reviewed artifact to pre/post catalog | Exact approved columns, types, nullability, defaults/checks, indexes, and no rewrite of `stock_history` |
| Product FK | Test valid/missing/deletion/update cases using synthetic rows | Exact approved reference to unique `products.id` and approved retention actions |
| Order FK | Test valid/missing/deletion/update cases | Exact approved reference to `orders.id`; audit-preserving action |
| Order-item FK | Test valid/missing/deletion/update cases | Exact approved reference to unique `order_items.id`; audit-preserving action |
| Unique operation identity | Compete on `(operationKind, orderId, orderItemId)` | One cancellation-return movement per order line; all three values mandatory for cancellation rows |
| Quantity and timestamp | Inspect physical types/check/default; test boundary values | Positive original line quantity and durable server/database timestamp; no client authority |
| Rollback | Force schema/application transaction failures at each boundary | No partial schema state in scoped rehearsal and no partial business transaction |

## 3. Recovery behavior matrix

| Scenario | Fixture/stimulus | Expected result |
|---|---|---|
| Multi-line order | Three distinct order-item identities | One `RETURN` movement and exact restock per line; all commit or none |
| Same product, multiple lines | A→X, B→Y, C→X | Three movement identities; X increases by `A.quantity + C.quantity` exactly once |
| Duplicate cancellation | Replay after complete committed cancellation | No second movement/restock; approved idempotent response only after complete-set verification |
| Concurrent cancellation | Two barrier-synchronized transactions | One winner; loser re-reads committed state; no double restock or partial set |
| Direct unique conflict | Pre-establish exact line operation identity | Duplicate claim cannot mutate stock; partial/mismatched set becomes manual review |
| Stock recovery | Use authoritative persisted order-line quantities | Final stock = initial stock + each eligible line quantity exactly once |
| `RETURN` movement | Complete eligible cancellation | Exactly one immutable `RETURN` row per recovered line with operation and actor context |
| Null `productId` | Historical line with null reference, if schema permits | No identity inference, no automatic restock, no partial effects; manual review |
| Missing product | Orphan/missing target fixture compatible with approved FK setup | No substitution or automatic restock; whole operation fails closed/manual review |
| Inactive product | Existing identified inactive product | Execute only the approved allow/block/manual-review branch; never treat as missing |
| Rollback | Inject failure after guard, each claim/increment/movement, and before commit | Order, stock, movement, and atomic audit state equal pre-transaction state |

## 4. Race matrix

Run every race with controlled commit ordering in both directions and independent database sessions:

- cancellation versus cancellation;
- cancellation versus checkout/stock mutation where logically applicable;
- cancellation versus webhook;
- cancellation versus payment transition;
- cancellation while a duplicate movement claim exists.

Expected invariants: no oversell, no double restock, no duplicate movement, no status downgrade, and no partial transaction. Webhook/payment cases remain blocked until cancellation eligibility and payment/refund transition policies are approved.

## 5. Evidence and exit criteria

Retain sanitized pre/post catalog, constraint definitions, transaction outcomes, row counts, movement identities, per-product stock arithmetic, lock/timing observations, injected-failure points, and teardown result. PASS requires all approved branches to pass with the exact reviewed artifact. A conceptual or static pass is not runtime proof.

```text
MIGRATION B REHEARSAL = BLOCKED
PHYSICAL MIGRATION B = NOT AUTHORED
SCHEMA COMPATIBILITY = INCOMPLETE
UNIQUE OPERATION IDENTITY = STATIC PASS / RUNTIME BLOCKED
STOCK RECOVERY = NOT RUN
RETURN MOVEMENT = NOT RUN
RUNTIME CONCURRENCY = BLOCKED
RUNTIME ROLLBACK = BLOCKED
MIGRATION EXECUTED = NO
CANCELLATION = NOT ACTIVATED
```