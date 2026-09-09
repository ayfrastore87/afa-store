# FASE 2.50 — Business Policy Decision Gate

**Level:** Principal Engineer
**Mode:** policy + design + migration readiness
**Environment:** non-Production only
**Date:** 2026-09-09
**Status:** decisions requested; no business approval inferred

## 1. Scope and evidence boundary

This document records questions, safe technical defaults, and implementation consequences. A safe default is fail-closed behavior while approval is absent; it is **not** a business decision. This phase did not connect to Production, run SQL or a migration, change schema/data/configuration/secrets/dependencies, commit, or push.

Code evidence recognizes these canonical persisted states:

- fulfillment: `PENDING`, `PROCESSING`, `PACKED`, `SHIPPED`, `COMPLETED`, `CANCELLED`;
- payment: `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`.

`WAITING_PAYMENT` exists as a legacy Prisma default/UI compatibility term and is not established as a canonical payment write. `FAILED` and `REFUNDED` are requested audit vocabulary but are not established by current transition code as persisted payment states. No new status is proposed. The word `processed` in the requested matrix is interpreted only as the existing canonical `PROCESSING` state.

## 2. Policy matrix

| POLICY | CURRENT STATUS | DECISION REQUIRED | SAFE DEFAULT | IMPLEMENTATION IMPACT |
|---|---|---|---|---|
| Customer may cancel | No customer cancellation endpoint evidenced | Whether customers may request cancellation and who approves it | Customer cancellation disabled | Do not expose customer cancel action/route |
| Customer cancellation actor/ownership | Undefined | Customer self-service versus staff-reviewed request; ownership checks | Admin-only server flow | A future customer route needs authenticated order ownership and anti-enumeration |
| `PENDING` fulfillment cancellation | Undefined business policy | Customer/admin eligibility and time window | Reject until approved | Source-state allowlist in transaction |
| `PROCESSING` fulfillment cancellation | Undefined business policy | Customer/admin eligibility and operational cutoff | Reject until approved | Source-state allowlist and fulfillment coordination |
| `PACKED` fulfillment cancellation | Undefined business policy | Whether unpacking permits cancellation | Reject until approved | Warehouse/manual handling and explicit allowlist |
| `SHIPPED` fulfillment cancellation | Undefined business policy | Return-to-sender/returns policy | Reject | Must not be treated as ordinary cancellation/restock |
| `COMPLETED` fulfillment cancellation | Undefined business policy | Returns/refunds process, if any | Reject | Separate post-completion business flow may be needed; no status invented here |
| `CANCELLED` fulfillment cancellation | Terminal state evidenced | Duplicate response semantics | No transition and no second restock | Durable operation lookup; `409` unless an approved idempotent replay contract applies |
| Payment-dependent cancellation | Undefined | Eligibility for each canonical payment state | Fail closed | Re-read authoritative `Payment.status` in cancellation transaction |
| Unpaid cancellation | Undefined for `PENDING`, `EXPIRED`, `CANCELLED` | Whether each state permits fulfillment cancellation and gateway cancel/expire coordination | Reject until matrix approved | Payment/order race guard and reconciliation path |
| Paid cancellation | Undefined | Whether `PAID` orders may cancel and at which fulfillment states | Reject | No cancellation/restock until refund policy and race behavior are approved |
| Refund required | Undefined | Whether accepted paid cancellation requires full/partial refund | No paid cancellation | Amount and completion preconditions must be authoritative |
| Refund authority | Undefined | Named role/system allowed to authorize and execute refunds | No refund operation | Separate authorization and audit fields required |
| Refund method | Undefined | Manual versus automatic gateway refund; full versus partial | No automation | Gateway adapter/workflow and reconciliation design depend on decision |
| Refund failure | Undefined | Whether cancellation remains pending, fails atomically, or enters manual reconciliation | Do not mark cancellation complete | Requires approved orchestration; external gateway cannot be made atomic with DB transaction |
| Refund retry | Undefined | Retry owner, limits, idempotency identity, schedule | No automatic retry | Dedicated durable refund attempt identity would be required |
| Refund audit | Undefined | Required actor, gateway reference, amount, reason, timestamps, outcome | Preserve existing payment records; no fabricated `REFUNDED` state | Audit storage and retention must be approved before implementation |
| Inventory recovery architecture | Current schema insufficient | Approve ledger or minimal marker | No automatic restock | Cancellation implementation remains blocked |
| Null/deleted product handling | Identity cannot be proven/update target absent | Approve manual exception process | No automatic restock; manual review | Transaction returns business validation/manual-review result |
| Inactive product handling | `productId` still identifies a row | Whether inactive products may receive recovered stock | Identity eligible, but effect blocked pending policy | Do not substitute name/price/subtotal; explicit policy branch |

All unresolved rows have status **REQUIRE BUSINESS DECISION**.

## 3. Customer cancellation questions requiring explicit answers

1. May a customer cancel an order at all?
2. For each `PENDING`, `PROCESSING`, `PACKED`, `SHIPPED`, `COMPLETED`, and `CANCELLED` fulfillment state, is cancellation allowed, by which actor, and within what time window?
3. Does eligibility differ for payment `PENDING`, `PAID`, `EXPIRED`, or `CANCELLED`?
4. May a `PAID` order be cancelled?
5. If yes, is refund mandatory, full or partial, manual or automatic, and who has authority?
6. What must happen when refund submission fails or its result is unknown? Who may retry, under what idempotency key, and how is reconciliation audited?

**STATUS = REQUIRE BUSINESS DECISION.** No answer is selected by this document.

## 4. Admin cancellation policy and server contract

The accepted temporary technical policy is authorization architecture, not status eligibility:

```text
Admin browser
  -> POST /api/admin/orders/[id]/cancel
  -> authenticated Supabase user
  -> public.users mapping
  -> role = admin
  -> isActive = true
  -> guarded order/payment transition
  -> one database transaction
  -> durable inventory recovery + audit
  -> sanitized response
```

The browser must not directly mutate order status, stock, or history. The route must distinguish authentication from authorization so its contract can return:

| Result | Meaning |
|---:|---|
| `401` | no authenticated Supabase identity |
| `403` | authenticated identity is not an active mapped admin |
| `404` | order unavailable/not found; do not reveal inaccessible records |
| `409` | invalid/competing/already transitioned state |
| `422` | approved policy/business validation failed, including manual-review conditions |
| `500` / `503` | sanitized server/dependency failure; no internal error exposed |

Current `getCurrentAdmin()` is appropriate as a deny-by-default admin guard, but returns `null` for several causes. A future implementation that promises distinct `401`/`403` must safely classify authentication before admin authorization. No route is implemented in this phase.

### Direct mutation inventory

| Location | CURRENT | TARGET |
|---|---|---|
| `src/app/admin/page.tsx:361` (`supabase.from("orders").update(orderPatch).eq("id", order.id)`) | **UNSAFE**: browser-controlled status/timestamp write, no transactional state/payment/inventory guard | **SERVER API**; cancellation through `POST /api/admin/orders/[id]/cancel`; other status transitions also require authorized guarded server APIs |

Repository search found order reads/subscriptions elsewhere, but no other direct client-side order write. This is static evidence, not an RLS or runtime proof.

## 5. Payment policy audit

| Requested term | Evidence classification | Cancellation policy |
|---|---|---|
| `WAITING_PAYMENT` | Legacy/default compatibility value | Normalize/read compatibility only after data audit; do not introduce a new write |
| `PENDING` | Canonical current payment state | REQUIRE BUSINESS POLICY |
| `PAID` | Canonical current payment state | REQUIRE BUSINESS POLICY; safe default rejects paid cancellation |
| `FAILED` | Not in current `PaymentState` transition type | Do not write; mapping/policy required if real data evidence later establishes it |
| `EXPIRED` | Canonical current payment state | REQUIRE BUSINESS POLICY |
| `CANCELLED` | Canonical current payment state | REQUIRE BUSINESS POLICY; payment cancellation is not proof inventory was restored |
| `REFUNDED` | Not in current `PaymentState` transition type | Do not write or claim support; refund representation requires separate approval/design |

`Payment.status` is the authoritative current payment state; `Order.paymentStatus` is its compatibility projection. Existing webhook logic prevents a `PAID` downgrade and flags late conflicting events for reconciliation. Cancellation must coordinate with that logic and never infer a refund from order cancellation.

## 6. Order cancellation state-transition matrix

Only states evidenced in code appear below. Every eligibility decision remains unresolved.

| CURRENT | ACTION | NEXT | ALLOWED ACTOR | PAYMENT REQUIREMENT | STOCK EFFECT |
|---|---|---|---|---|---|
| `PENDING` | cancel | `CANCELLED` if approved | Admin temporarily; customer UNKNOWN | UNKNOWN / POLICY REQUIRED | One `RETURN` recovery only after durable claim; otherwise none |
| `PROCESSING` | cancel | `CANCELLED` if approved | UNKNOWN / POLICY REQUIRED | UNKNOWN / POLICY REQUIRED | Same, only if approved and all lines recoverable |
| `PACKED` | cancel | `CANCELLED` if approved | UNKNOWN / POLICY REQUIRED | UNKNOWN / POLICY REQUIRED | Same; warehouse consequence requires policy |
| `SHIPPED` | cancel | UNKNOWN / POLICY REQUIRED | UNKNOWN / POLICY REQUIRED | UNKNOWN / POLICY REQUIRED | No automatic restock by safe default |
| `COMPLETED` | cancel | UNKNOWN / POLICY REQUIRED | UNKNOWN / POLICY REQUIRED | UNKNOWN / POLICY REQUIRED | No automatic restock by safe default |
| `CANCELLED` | cancel | `CANCELLED` (no transition) | Authenticated authorized caller only | Existing state must not be overwritten | No second restock; durable result/conflict per approved replay contract |

The matrix does not approve any transition. Until approval, the implementation allowlist is empty.

## 7. Inventory design decision

| Criterion | Option A — existing `stock_history` only | Option B — dedicated durable recovery marker | Option C — inventory movement ledger |
|---|---|---|---|
| Exactly-once | **FAIL**: no evidenced operation/order unique key | PASS if unique business key and effect are atomic | PASS if unique operation key and posting are atomic |
| Concurrency | Duplicate increments remain possible | Unique claim selects one winner | Unique operation selects one winner and records movement |
| Auditability | Historical row only; cannot prove causal cancellation identity | Good order-level recovery audit | Strong order/product/movement-level audit |
| Rollback | DB transaction can roll back rows, not deduplicate requests | Claim, state, stock, and audit roll back together | Operation, state, stock, and movement roll back together |
| Duplicate request | Cannot reliably identify | Deduplicated per approved operation scope | Deduplicated by operation identity |
| Webhook interaction | No shared durable cancellation identity | Payment guard plus recovery claim needed | Payment guard plus auditable movement needed |
| Future reporting | Existing compatibility reports only | Limited recovery reporting | Best movement/reconciliation reporting |
| Migration complexity | None, but correctness goal blocked | Medium | Highest |
| Production compatibility | Existing table preserved; exact metadata still incomplete | Additive candidate; metadata/rehearsal required | Additive candidate; metadata/rehearsal required |

**TECHNICAL RECOMMENDATION = PENDING EXPLICIT APPROVAL.** Based on FASE 2.49, prefer **Option C, a dedicated inventory movement ledger**. Option B is acceptable only if explicitly approved as a narrower invariant and it durably enforces one recovery operation per intended business scope. Option A must not power automatic restock.

### Proposed operation identity (concept, not schema)

A safer conceptual identity is a structured tuple:

```text
operation_kind = ORDER_CANCELLATION_RETURN
aggregate_id   = canonical orderId
scope_id       = canonical orderItemId (for one movement per line)
operation_key  = deterministic canonical encoding/version of the tuple
```

For an order-level marker, the equivalent invariant is `(ORDER_CANCELLATION_RETURN, orderId)` unique. For a movement ledger, `(ORDER_CANCELLATION_RETURN, orderId, orderItemId)` unique avoids ambiguity where multiple order lines reference the same product. A display form such as `v1:ORDER_CANCELLATION_RETURN:{orderId}:{orderItemId}` is illustrative only: canonical escaping/encoding, maximum length, case rules, and unique constraint must be designed and rehearsed before schema approval.

The identity is deterministic, unique within its declared scope, durable, concurrency-safe only when database-enforced unique, and auditable. A random history `id`, request UUID, timestamp, product name, price, subtotal, or nonexistent SKU is not the business operation identity. `CheckoutIdempotency` must not be reused.

## 8. Future atomic stock-recovery flow

```text
begin transaction
  load/lock order, authoritative payment, and order items
  verify approved actor, source state, payment policy, and complete recoverability
  claim deterministic durable recovery operation(s) under unique constraint
  perform guarded order transition to CANCELLED
  increment each valid product by original order-item quantity
  write inventory movement RETURN and required compatibility audit atomically
commit
```

- Duplicate request: unique claim/operation lookup ensures **NO SECOND RESTOCK**.
- Transaction failure: order transition, claims/movements, stock increments, and atomic audit all roll back; **NO PARTIAL EFFECT**.
- Concurrent cancellation: one transaction wins; the other returns the approved replay result or `409`, without stock effect.
- Cancellation/webhook or payment-update race: authoritative payment and order state must be transactionally re-read/guarded; ambiguous external refund outcomes go to reconciliation, never silent success.
- `productId` valid and product exists: eligible for recovery, subject to active-product policy.
- `productId` null: no automatic restock; manual review.
- Product deleted/missing: no automatic restock; manual review unless a future durable historical-inventory policy explicitly supports a valid target.
- Product inactive: identity remains valid; whether stock is incremented is a policy decision. Never substitute name, price, subtotal, or an unavailable SKU.

Safe default requires all lines to be recoverable before transitioning the order; partial automatic recovery is blocked unless separately designed and approved.

## 9. Test contract (non-Production only)

| # | Scenario | Required assertion |
|---:|---|---|
| 1 | cancel `PENDING` | Behavior matches approved allowlist/payment policy; one atomic effect if allowed |
| 2 | cancel `PROCESSING` | Same; no inferred approval |
| 3 | cancel `PACKED` | Same; warehouse rule enforced |
| 4 | cancel `SHIPPED` | Rejected by default unless explicit policy exists; no stock effect |
| 5 | cancel `COMPLETED` | Rejected by default unless explicit policy exists; no stock effect |
| 6 | duplicate cancel | No second restock/movement |
| 7 | concurrent cancel | Exactly one committed recovery operation |
| 8 | cancel + webhook | No payment downgrade or contradictory success; reconciliation where required |
| 9 | cancel + payment update | Guarded authoritative outcome; no partial effect |
| 10 | valid product restock | Exact `productId` increment by original quantity and `RETURN` movement |
| 11 | null `productId` | `422`/manual review; no cancellation or stock effect under all-or-nothing default |
| 12 | deleted product | Manual review; no identity substitution or automatic restock |
| 13 | inactive product | Approved policy enforced while identity remains `productId` |
| 14 | stock history | Required compatibility audit is atomic and references approved operation context |
| 15 | rollback | Injected failure leaves order, stock, movement/marker, and audit unchanged |
| 16 | unauthorized admin | `403`, no writes |
| 17 | inactive admin | `403`, no writes |

Also verify unauthenticated `401`, unavailable order `404`, invalid state `409`, sanitized `500/503`, and operation-key collision handling. No Production tests are permitted.

## 10. Approval matrix

| Approval | Scope | Current status | Does not imply |
|---|---|---|---|
| BUSINESS APPROVAL | Actor/state/payment/refund/inactive-product/manual-review policy | **REQUIRED / NOT GRANTED** | Technical, migration, or Production execution approval |
| TECHNICAL APPROVAL | Ledger/marker, operation identity, transaction/API/test architecture | **REQUIRED / NOT GRANTED** | Business, migration, or Production execution approval |
| MIGRATION APPROVAL | Reviewed artifact after metadata verification and disposable rehearsal | **REQUIRED / NOT GRANTED** | Business policy or Production execution approval |
| PRODUCTION EXECUTION APPROVAL | Specific artifact, window, operator, backup/monitor/rollback plan | **REQUIRED / NOT GRANTED** | Any other approval; no execution is authorized here |

Each approval must be explicit, independently recorded, scoped, and attributable. Approval in one row never satisfies another.

## 11. Gate result

```text
BUSINESS POLICY = REQUIRE DECISION
CANCELLATION DESIGN = PASS (design only; implementation blocked by policy/schema)
REFUND DESIGN = BLOCKED
INVENTORY DESIGN = PASS (comparative future design; selection pending approval)
EXACTLY-ONCE DESIGN = PASS (future ledger/marker design) / BLOCKED (current schema)
ADMIN SERVER CONTRACT = PASS (design only; not implemented)
MIGRATION DESIGN = PASS (design only; not approved)
REHEARSAL PLAN = PASS (plan only) / BLOCKED (no disposable database evidenced)
TEST CONTRACT = PASS (design only; runtime concurrency not executed)

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
CHECKOUTIDEMPOTENCY = NOT EXECUTED
CANCELLATION MIGRATION = NOT EXECUTED
```

**CRITICAL BLOCKERS:** customer/status/payment/refund policy not approved; inventory option and operation scope not technically approved; current schema cannot prove exactly-once recovery; Production metadata remains incomplete; no disposable non-Production database is evidenced; server route and concurrency/rollback proof do not exist; direct browser mutation remains.

**NEXT PHASE:** obtain the four explicit approval decisions in sequence; complete authorized catalog-only metadata review; provide an isolated disposable database; rehearse separate additive migrations; then implement and test the server cancellation path before any Production execution request.

STOP.