# FASE 2.51 — Inventory Ledger Design

**Status:** conceptual design only; no Prisma schema, constraint, migration, or DDL

## 1. Conceptual entity

`InventoryMovement` is a durable business-operation record, not merely an audit log.

| Conceptual field | Requirement |
|---|---|
| `id` | Durable row identity |
| `productId` | Required product identity, referencing `products.id` |
| `movementType` | Existing vocabulary only: `IN`, `OUT`, `SALE`, `RETURN`, `ADJUSTMENT` |
| `quantity` | Positive movement quantity; original order-item quantity for recovery |
| `operationKind` | Deterministic operation family, including `ORDER_CANCELLATION_RETURN` |
| `orderId` | Aggregate/reference identity for order operations |
| `orderItemId` | Line/reference identity for line-scoped operations |
| `createdAt` | Durable creation timestamp |
| actor/audit fields | Nullable only where compatible; authenticated admin identity and explanatory reference when available |

The final physical types, nullability, FK actions, naming, and indexes require catalog compatibility review before Migration B is authored. This table is additive and must not silently rewrite existing `stock_history`.

## 2. Exactly-once invariant

For cancellation recovery, the authoritative uniqueness identity is:

```text
(operationKind, orderId, orderItemId)
```

where `operationKind = ORDER_CANCELLATION_RETURN`. This is correct because recovery is performed for each original order line, and two lines may refer to the same product while remaining distinct business lines. An order-level key `(operationKind, orderId)` is useful only as an additional aggregate guard/completeness check; it cannot be the sole identity unless the approved design collapses all line movements into one audited aggregate movement.

The operation key is deterministic, not request-generated. A repeated request resolves to the existing committed movement and does not increment stock again. A concurrent request can claim only one unique line operation; the loser returns the approved duplicate/no-op conflict contract.

## 3. Transaction contract

```text
BEGIN
  authenticate admin
  load order and authoritative payment state
  verify approved fulfillment/payment eligibility
  load all order items
  validate every product identity and approved inactive-product policy
  claim each line's unique ORDER_CANCELLATION_RETURN operation
  guarded transition order to CANCELLED
  atomically increment each exact products.id by original quantity
  create RETURN movement(s)
COMMIT
```

Any failure rolls back order state, stock, movement rows, and compatible audit records. The transaction must be designed so a partial multi-line recovery cannot commit. Webhook/payment races must re-read and guard authoritative state; refund is not inferred or faked.

## 4. Identity edge cases

- `productId = NULL`: reject/manual review; no automatic stock change.
- Product missing/deleted: reject/manual review; never substitute by name or snapshot fields.
- Inactive product: retain `productId`; behavior awaits business approval.
- Multiple lines: one movement identity per `orderItemId`.
- Same product on multiple lines: separate line movements, exact quantity per line.
- Existing `stock_history`: may be written as a compatible audit projection only if atomic and approved; it is not the exactly-once authority.

## 5. Non-goals

No refund flow, customer cancellation policy, new movement type, status enum, schema edit, constraint, migration, or executable DDL is introduced here.