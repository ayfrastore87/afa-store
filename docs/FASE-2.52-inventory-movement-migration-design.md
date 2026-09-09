# FASE 2.52 — InventoryMovement Migration Design

**Status:** design artifact only; not executable SQL, Prisma schema, or migration
**Migration B:** `NOT AUTHORED / NOT EXECUTED`
**Technical approval:** `REQUIRE REVIEW`

## 1. Purpose and boundary

`InventoryMovement` is the durable operation ledger and audit authority for inventory effects. Existing `stock_history` may later receive an atomic projection if compatible and approved, but it cannot provide the evidenced cancellation deduplication invariant.

This document deliberately specifies no physical SQL types for identities that lack verified Production evidence. It does not create `prisma/migrations/*` or change `prisma/schema.prisma`.

## 2. Conceptual entity

| Field | Cancellation-row requirement | Physical status |
|---|---|---|
| `id` | Required, durable and immutable row identity | Type/default UNKNOWN — REVIEW REQUIRED |
| `productId` | Required for an automatic cancellation return; references the exact product | Production type UNKNOWN — REVIEW REQUIRED |
| `movementType` | Required; existing vocabulary value `RETURN` | Physical type/check UNKNOWN — REVIEW REQUIRED |
| `quantity` | Required positive original order-line quantity; never client-derived | Physical numeric type/check UNKNOWN — REVIEW REQUIRED |
| `operationKind` | Required; `ORDER_CANCELLATION_RETURN` | Physical type/check UNKNOWN — REVIEW REQUIRED |
| `orderId` | Required for cancellation rows | Production identity is verified `text`; final mapping still requires catalog review |
| `orderItemId` | Required for cancellation rows | Production type UNKNOWN — REVIEW REQUIRED |
| `createdAt` | Required durable server/database creation timestamp | Exact type/default UNKNOWN — REVIEW REQUIRED |
| `actorUserId` | Authenticated active application-admin audit identity when compatible | Candidate reference to verified `users.id text`; nullability/retention REQUIRE DECISION |
| audit context | Optional structured reason/source/correlation metadata; must be sanitized and bounded | Shape/type/retention REQUIRE DECISION |

No automatic movement is written for a null or unresolved product reference. Such an order enters a no-restock/manual-review result; product identity must never be inferred from name, snapshot, SKU-like text, or line position.

## 3. Production identity compatibility

| Existing identity | Verified Production evidence | Proposed compatibility result |
|---|---|---|
| `orders.id` | `text NOT NULL`, primary key | `InventoryMovement.orderId` must use a compatible `text` identity — PASS |
| `order_items.id` | Table exists; column/type/PK metadata unavailable | UNKNOWN / REVIEW REQUIRED |
| `order_items.productId` | Column/type/nullability/FK metadata unavailable | UNKNOWN / REVIEW REQUIRED |
| `products.id` | Table exists; column/type/PK metadata unavailable | UNKNOWN / REVIEW REQUIRED |
| `stock_history.id` | Table exists; exact type/default unavailable in current verified bundle | UNKNOWN; it is not reused as ledger identity |
| `users.id` | `text NOT NULL`, primary key | Candidate actor identity is type-compatible — PASS, policy pending |

Prisma's local `String` declarations are useful implementation context but are **not** promoted to Production evidence. Physical Migration B authoring is blocked until catalog-only evidence verifies `order_items.id`, `order_items.productId`, `products.id`, their referenced uniqueness, and the desired quantity/timestamp representation.

## 4. Exact unique invariant and null semantics

For cancellation recovery, the exact database-enforced identity is:

```text
(operationKind, orderId, orderItemId)
where operationKind = ORDER_CANCELLATION_RETURN
```

All three components are mandatory (`NOT NULL`) for cancellation-return rows. In PostgreSQL, an ordinary unique constraint permits multiple tuples containing null because nulls are not equal. A nullable `orderItemId` would therefore allow duplicate cancellation returns and is unsafe. The physical design must make line identity mandatory for this operation family; if one shared ledger later supports unrelated operations without order lines, it must enforce operation-specific non-null checks and equivalent null-safe uniqueness, or separate those operation shapes. It must never weaken cancellation uniqueness to accommodate other operations.

The invariant is line-based, not product-based and not request-based. Request IDs, timestamps, `cancelledAt`, and generated movement IDs are not deduplication identities.

## 5. FK deletion design

| FK | CASCADE evaluation | SET NULL evaluation | Selected design |
|---|---|---|---|
| `productId → products.id` | Would erase movement evidence when a product is deleted; unsafe | Conflicts with required exact product identity and weakens audit | **RESTRICT / NO ACTION**, mandatory reference |
| `orderId → orders.id` | Would erase all cancellation evidence with an order; unsafe | Loses aggregate provenance and weakens unique identity | **RESTRICT / NO ACTION**, mandatory reference |
| `orderItemId → order_items.id` | Would erase line recovery proof; unsafe | Enables nullable-unique duplicate risk and loses line provenance | **RESTRICT / NO ACTION**, mandatory reference |
| candidate `actorUserId → users.id` | Would erase movements with an actor; unsafe | Preserves ledger while allowing user lifecycle | **SET NULL candidate — REQUIRE DECISION**, or immutable actor snapshot without FK |

`RESTRICT / NO ACTION` preserves the audit chain and forces archival/soft-delete behavior for referenced business records. The exact PostgreSQL action (`RESTRICT` versus deferrable/immediate `NO ACTION`) and actor retention policy require technical/operational review. Business approval is required if hard deletion must remain supported. No delete behavior is assumed to exist in Production.

## 6. Atomic stock-recovery contract

Authentication occurs before transaction work, while all authoritative state and mutation work occurs in one database transaction:

```text
authenticate Supabase identity
resolve public.users identity; require role=admin and isActive=true
BEGIN TRANSACTION
  verify order authority/scope
  load and lock/guard order plus authoritative payment state
  verify current status against the approved cancellation allowlist
  verify cancellation and payment/refund policies
  load all order items using stable line identities and original quantities
  validate every quantity and productId; resolve every referenced product
  if any line is null/missing or policy-blocked: return manual review and roll back all effects
  claim every (ORDER_CANCELLATION_RETURN, orderId, orderItemId) identity
  guarded order transition to CANCELLED
  atomically increment each exact product by each original line quantity
  persist one RETURN InventoryMovement per line, including operation identity and actor context
COMMIT
return sanitized server response
```

The claim and final movement are one durable row per line, not a temporary marker followed by a second row. Implementation may insert claims before stock mutation inside the transaction, but they become visible/durable only at commit. Unique conflict handling must occur without leaving the transaction in a partially failed state (for example, claim through a conflict-aware operation or recover at a transaction boundary). The final implementation strategy requires executable rehearsal.

### Exactly-once outcomes

- **Duplicate request:** if all expected committed line identities already exist and the order is durably cancelled, return the approved idempotent result; perform no stock update and write no second movement. A partial/mismatched identity set is an integrity conflict requiring manual review, never an invitation to fill gaps blindly.
- **Concurrent requests:** the unique constraint and guarded order state permit only one transaction to establish recovery. The loser observes a unique/guard conflict, re-reads committed state, and returns idempotent success or conflict; it never restocks.
- **Rollback:** any auth-policy/state/reference/claim/stock/movement failure rolls back order state, every stock increment, every movement, and atomic audit context. No partial multi-line cancellation may commit.
- **Payment/webhook race:** authoritative order and payment state must be locked or conditionally guarded under an approved isolation/coordination strategy. Paid cancellation remains blocked until refund behavior is approved; no webhook may downgrade a terminal/cancelled state through an unguarded write.

## 7. Multi-line proof obligation

Given:

```text
item A → product X
item B → product Y
item C → product X
```

the committed recovery contains three identities:

```text
(ORDER_CANCELLATION_RETURN, orderId, item A id)
(ORDER_CANCELLATION_RETURN, orderId, item B id)
(ORDER_CANCELLATION_RETURN, orderId, item C id)
```

Product X is incremented by `A.quantity + C.quantity`, but A and C remain separate movements. Product equality must not collapse line identities. Every increment is atomic and the transaction commits all three lines or none.

## 8. Application and test contract (not implemented)

Target route: `POST /api/admin/orders/[id]/cancel`.

The server obtains authenticated Supabase identity, resolves `public.users`, requires an active admin, calls the cancellation service, executes the transaction above, and returns only a sanitized response. The browser cannot supply authoritative product, quantity, payment state, actor, or stock values. The direct browser mutation at `src/app/admin/page.tsx:361` remains unsafe and must be removed/disabled only in the coordinated future implementation phase.

Required executable tests on an isolated disposable non-Production database: duplicate request, concurrent request, direct unique conflict, injected rollback at every boundary, stock exactness, multi-line, repeated product, null product, inactive product, missing product, terminal state, webhook race, and payment race. No dependency is added by this specification.

## 9. Design gate

```text
MIGRATION B DESIGN = PASS (conceptual) / BLOCKED (physical artifact)
SCHEMA COMPATIBILITY = REVIEW REQUIRED
UNIQUE INVARIANT = PASS
EXACTLY-ONCE DESIGN = PASS (static) / runtime proof BLOCKED
MULTI-LINE DESIGN = PASS
NULL PRODUCT POLICY = PASS
ROLLBACK DESIGN = PASS (static) / runtime proof BLOCKED
INACTIVE PRODUCT POLICY = REQUIRE DECISION
PAYMENT/REFUND POLICY = REQUIRE DECISION
```