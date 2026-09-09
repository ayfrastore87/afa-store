# FASE 2.52 — Static Rehearsal Matrix

**Mode:** design simulation only
**Database:** not created, connected, or used
**Runtime rehearsal:** `BLOCKED` because no verified isolated disposable non-Production PostgreSQL environment is available

`STATIC PASS` below means the expected behavior and proof obligation are specified. It does not claim that schema, transactions, concurrency, or races have run successfully.

## 1. Matrix

| TEST | EXPECTED | REQUIRED ENVIRONMENT | CURRENT STATUS |
|---|---|---|---|
| Migration A schema compatibility | Exact unchanged artifact creates `CheckoutIdempotency` with PK, unique `key`, unique nullable `orderId`, supporting indexes, and compatible FKs; old app remains safe | Disposable PostgreSQL matching verified target metadata; pre/post catalog and app versions | STATIC PASS; EXECUTION BLOCKED |
| Migration B schema compatibility | Additive ledger uses verified target identity types and approved nullability/check/FK actions; no rewrite of `stock_history` | Complete relevant catalog evidence plus disposable PostgreSQL and reviewed physical artifact | REVIEW REQUIRED / BLOCKED |
| Unique constraint | Second `(ORDER_CANCELLATION_RETURN, orderId, orderItemId)` claim cannot commit | Physical unique constraint in disposable PostgreSQL | STATIC PASS; RUNTIME BLOCKED |
| Duplicate cancellation | Replay returns approved idempotent outcome only after complete durable recovery proof; no second movement or stock increment | Server service, ledger schema, representative order | STATIC PASS; RUNTIME BLOCKED |
| Concurrent cancellation | One recovery commits; loser re-reads and returns idempotent result/conflict; exactly one increment per line | Two independent DB sessions, deterministic synchronization/barriers | STATIC PASS; RUNTIME BLOCKED |
| Rollback | Failure at each transaction boundary leaves order, all product stocks, movements, and atomic audit unchanged | Fault-injectable service and disposable DB | STATIC PASS; RUNTIME BLOCKED |
| Webhook race | Cancellation and webhook resolve through guarded authoritative states; no status downgrade or inventory duplication | Payment webhook harness, two sessions, approved transition policy | POLICY + RUNTIME BLOCKED |
| Payment race | Cancellation versus payment update has one approved outcome; paid cancellation is blocked absent approved refund path | Payment harness, approved payment/refund matrix, two sessions | POLICY + RUNTIME BLOCKED |
| Multi-line | One movement and exact increment for every order item; all lines commit or none | Order with at least three stable line identities | STATIC PASS; RUNTIME BLOCKED |
| Same product on multiple lines | Separate movement identities for A and C; product stock rises by both original quantities exactly once | Multi-line fixture with A→X, B→Y, C→X | STATIC PASS; RUNTIME BLOCKED |
| Null `productId` | No identity inference and no automatic restock; whole automatic cancellation recovery fails closed/manual review with no partial effects | Nullable-product order fixture and manual-review response contract | STATIC PASS; RUNTIME BLOCKED |
| Inactive product | Preserve exact identity; follow explicitly approved allow/block/manual-review policy, never treat inactive as missing | Inactive product fixture and approved business policy | REQUIRE DECISION / BLOCKED |
| Missing product | No automatic restock or substitution; manual review, no partial effects | Historical/orphan reference fixture consistent with approved FK setup | STATIC PASS; RUNTIME BLOCKED |
| Terminal order | Non-cancellable terminal state returns conflict with no stock/movement/order mutation | Fixture for each terminal state and approved status allowlist | POLICY + RUNTIME BLOCKED |

## 2. Test contract details

The future executable suite must additionally assert:

- **Duplicate request:** same completed result semantics and stable movement identities, not merely a repeated `200`.
- **Concurrent request:** deterministic overlap, one transaction winner, no deadlock leak, and correct loser classification.
- **Unique conflict:** a pre-existing exact line claim prevents stock mutation; a partial/mismatched movement set is an integrity/manual-review conflict.
- **Rollback:** inject failure after guard, after each claim, after each line increment, after each movement, and before commit; compare complete pre/post state.
- **Stock exactness:** final stock equals initial stock plus each original line quantity exactly once; never use client quantity.
- **Multi-line/repeated product:** assert three movement keys for A→X, B→Y, C→X and aggregate X increase `A.quantity + C.quantity`.
- **Null/missing product:** assert zero automatic recovery and zero partial commit; do not infer identity.
- **Inactive product:** test every ultimately approved branch.
- **Terminal state:** test every canonical terminal state and already-cancelled complete versus inconsistent recovery state.
- **Webhook/payment races:** control commit order in both directions and verify authoritative state, refund gate, movements, and stock.
- **Authorization:** unauthenticated, unmapped, inactive, and non-admin identities produce sanitized rejection with no writes.

## 3. Application contract under rehearsal

```text
POST /api/admin/orders/[id]/cancel
→ authenticated Supabase identity
→ resolve public.users
→ require role=admin and isActive=true
→ cancellation service
→ one atomic transaction
→ InventoryMovement RETURN rows
→ sanitized response
```

The route/service is not implemented or activated. The direct browser order mutation at `src/app/admin/page.tsx:361` remains documented as unsafe and must be disabled only in the coordinated future activation change.

## 4. Environment and exit gate

An authorized owner must provision and verify an isolated disposable non-Production PostgreSQL target through a secret-safe process, separate from existing application URLs. Do not request, display, alter, or fall back to `DATABASE_URL`/`DIRECT_URL`. The environment needs non-sensitive representative fixtures, parallel sessions, fault injection, payment/webhook harnessing, pre/post catalog capture, lock/timing observation, and explicit teardown.

Runtime rehearsal passes only when every applicable matrix row passes with retained sanitized evidence and no unexplained drift. Policy-dependent rows cannot pass before policy approval.

```text
STATIC REHEARSAL SPECIFICATION = PASS
MIGRATION A REHEARSAL = BLOCKED
MIGRATION B REHEARSAL = BLOCKED
CONCURRENCY/RACE PROOF = NOT RUN
REHEARSAL = BLOCKED
PRODUCTION TESTING = NO
```