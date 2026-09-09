# FASE 2.49 — Stock History Design

## 1. Purpose

This document defines how the existing Production `stock_history` table could be represented and used by a future application transaction. It does not change `prisma/schema.prisma`, generate a client, execute SQL, or run a migration.

## 2. Existing Production evidence

The evidenced table is `stock_history` with:

```text
id              GENERATED ALWAYS AS IDENTITY
product_id
product_name
transaction_type
quantity
stock_before
stock_after
note
created_by
created_at
```

The evidenced `transaction_type` check allows exactly:

```text
IN | OUT | SALE | RETURN | ADJUSTMENT
```

The Production schema manifest marks the remaining table metadata incomplete. In particular, no unique deduplication constraint, foreign key, index, owner, or RLS behavior is assumed here.

## 3. Proposed Prisma design artifact

If catalog verification confirms exact compatibility, a future Prisma model could be conceptually mapped as follows. This is pseudocode/design, not a schema edit:

```prisma
model StockHistory {
  id              Int      @id @default(autoincrement())
  productId       String   @map("product_id")
  productName     String   @map("product_name")
  transactionType String   @map("transaction_type")
  quantity        Int
  stockBefore     Int      @map("stock_before")
  stockAfter      Int      @map("stock_after")
  note            String
  createdBy       String   @map("created_by")
  createdAt       DateTime @map("created_at")

  @@map("stock_history")
}
```

This model is deliberately not added because the exact PostgreSQL type of `id`, nullability, defaults, timestamp precision, constraints, indexes, and ownership remain unverified in repository evidence. `Int @default(autoincrement())` is only acceptable after catalog confirmation of the identity type.

## 4. Identity handling

The generated `id` is an audit-row identity, not a business operation identity. It must not be used for cancellation idempotency. A future cancellation design requires one of:

- a durable unique `restock_operation_id`/marker associated with the order and operation; or
- a dedicated inventory movement table with a unique business key; or
- another verified database invariant that makes a second recovery impossible.

The existing table does not contain an evidenced `order_id`; therefore a `RETURN` row cannot currently be linked durably to an order through this table alone.

## 5. Transaction type mapping

Cancellation recovery would use `RETURN`, not `IN`, because the stock was previously removed by a sale. `SALE` represents the checkout decrement. `OUT`/`IN`/`ADJUSTMENT` remain existing manual inventory vocabulary. No new enum or check value is proposed.

## 6. Product-null behavior

The proposed model's `productId` is shown as required because a stock-history row for a product movement must identify a product. This does not mean existing `OrderItem.productId` may be coerced or inferred.

- valid order-item `productId`: may produce a future `RETURN` row;
- null `OrderItem.productId`: no automatic stock-history row and no automatic restock;
- inactive product: identity still exists; policy must decide whether inventory recovery is permitted;
- missing product: no automatic stock-history row and manual review.

Never use `product_name`, price, or quantity as a substitute identity.

## 7. Indexes and ownership

Future catalog verification must establish:

- primary key/index for `id`;
- indexes used by the cancellation transaction;
- whether RLS permits server-side writes under the selected database role;
- table owner and grants;
- exact check constraint for `transaction_type`;
- identity sequence ownership;
- timestamp type/default and nullability;
- whether any trigger modifies rows.

No index or ownership is inferred, and no DDL is provided.

## 8. Correctness limitation

Writing one `RETURN` row inside a transaction improves auditability but does not produce exactly-once recovery. A duplicate request can produce two rows and two stock increments unless the database can uniquely reject the second business operation. Therefore the current stock-history design is **audit-compatible but exactly-once-incomplete**.

## 9. Gate

```text
STOCK HISTORY FIELD MAPPING = PASS (based on supplied evidence)
PRISMA MODEL IMPLEMENTATION = DEFERRED
IDENTITY SAFETY = BLOCKED pending exact catalog verification
EXACTLY-ONCE USING TABLE ALONE = BLOCKED
PRODUCTION SCHEMA CHANGED = NO
MIGRATION EXECUTED = NO
```