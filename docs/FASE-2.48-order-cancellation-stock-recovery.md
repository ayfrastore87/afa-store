# FASE 2.48 — Order Cancellation & Stock Recovery Hardening

**Mode:** APPLICATION CODE ONLY / NON-PRODUCTION / FAIL-CLOSED
**Execution date:** 2026-09-09
**Production access:** none

## Executive summary

The audit found no active customer cancellation implementation and no active stock-recovery implementation. The customer order `PATCH` route authenticates, scopes the lookup by `userId`, and then rejects status mutation with `403`. The admin page can write an order status and `cancelledAt` directly through Supabase, but explicitly does not restore stock. This is safer than an unverifiable restock implementation: no double-restock path was introduced, but cancellation plus recovery is not a complete business capability.

The existing schema has no durable restock marker, inventory movement identifier, or Prisma stock-history model. `cancelledAt` alone cannot distinguish “cancelled but not recovered” from “cancelled and already recovered.” Exactly-once recovery is therefore **BLOCKED BY SCHEMA CAPABILITY**. No schema, migration, dependency, secret, or environment change was made.

## 1. Current cancellation architecture

- Customer route: `src/app/api/account/orders/[id]/route.ts` (`PATCH`). It is not a cancellation route; it rejects all status changes after authentication and ownership lookup.
- Admin route: none. `src/app/admin/page.tsx` performs a direct Supabase update on `orders`.
- Admin cancellation writes the requested status and `cancelledAt`, but no product or order-item stock mutation.
- No `cancel`, `restock`, webhook cancellation, expiration restock, or return-restock service was found.

## 2. Authorization

Customer behavior is fail-closed: unauthenticated requests return `401`; an order not owned by the authenticated user is hidden by the scoped lookup and returns `404`; an owned order still receives `403` because customer status mutation is not permitted. Admin access is established by the existing Supabase admin page/auth flow. The authorization model was not broadened.

**Result: PASS for the existing customer guard; cancellation capability remains unavailable.**

## 3. Status transition

Canonical fulfillment values are `PENDING -> PROCESSING -> PACKED -> SHIPPED -> COMPLETED`, with `CANCELLED` terminal. The admin client currently accepts an arbitrary status string from its status control and does not guard source state server-side. `COMPLETED`, `SHIPPED`, and other terminal/fulfillment states therefore do not have a transaction-backed cancellation proof.

**Result: BLOCKED.** A safe cancellation transition requires an approved server-side state guard and an atomic recovery design.

## 4. Stock decrement relationship

Checkout decrements product stock conditionally (`stock >= quantity`) inside the Prisma transaction before creating order items. This is the sale movement. Completion and payment webhook paths do not decrement stock.

## 5. Restock mechanism

There is no active cancellation restock mechanism. Deliberately, no increment was added. Product inactivity does not itself prevent a future recovery, but nullable `OrderItem.productId` means items with a null/deleted reference cannot be safely mapped back to inventory without an approved policy.

## 6. Exactly-once analysis

`cancelledAt` is only a timestamp and is insufficient as a durable idempotency marker. `CheckoutIdempotency` is unrelated and must not be reused. Without a durable movement/claim record or an equivalent existing database invariant, two concurrent cancellation requests cannot be proven to produce one and only one stock increment.

**Result: BLOCKED BY SCHEMA CAPABILITY.** No column, table, type, or workaround was created.

## 7. Transaction analysis

The existing admin operation is a standalone Supabase order update; it is not a Prisma transaction and has no stock operation to make atomic. A Prisma transaction can only be used after all required inventory objects and durable exactly-once semantics are available.

**Result: BLOCKED.** No partial cancellation/restock workflow was enabled.

## 8. Concurrency analysis

Cancellation vs cancellation, cancellation vs webhook/payment update, and cancellation vs admin status update are not runtime-proven. The current absence of restock prevents double-restock, but does not satisfy the requested recovery capability. A state-only client update is not sufficient concurrency protection.

**Result: BLOCKED.** No safe local/test database was available, and Production was not accessed.

## 9. Stock history

Admin manual stock changes update `products` and insert `stock_history` separately. `stock_history` is not represented in Prisma. Existing types include `IN`, `OUT`, `SALE`, and `RETURN`; no new type was introduced. Cancellation history cannot be made atomic with recovery using the current implementation.

**Result: BLOCKED.**

## 10. Payment interaction

Payment is authoritative through the webhook transition logic. Webhook processing is transactional and conditionally changes only `PENDING` payments; replay/late events are rejected or no-op. It does not mutate stock. A future cancellation policy must explicitly define pending, expired, cancelled, and paid orders before enabling recovery.

**Result: PASS for current payment authority; cancellation dependency BLOCKED.**

## 11. Test results

Initial `node --test tests/*.mjs` run produced **59 passed, 1 failed** due only to the previously identified stale payment-proof assertion. That assertion was updated to verify the intended authenticated, pre-parse `503` fail-closed behavior and absence of parsing, Prisma, filesystem, or payment-proof writes. Source behavior was not weakened. The final rerun result is recorded below.

## 12. Build and static checks

- `npm run typecheck`: PASS.
- `npm run lint`: PASS with 13 pre-existing warnings and zero errors.
- `npx prisma validate`: PASS; schema valid, with no database query or mutation.
- `npm run build`: environment blocked; the final invocation exceeded the 30-second command limit without producing output. The prior validated result remains compilation succeeded followed by TypeScript worker exit `3221225794`.

## 13. Remaining blockers

1. Durable exactly-once cancellation/restock capability is absent from the existing schema.
2. Server-side guarded admin status transition is absent; the current direct client update accepts arbitrary status strings.
3. Atomic stock recovery and stock-history recording are unavailable.
4. Product-null/deleted handling requires an approved inventory policy.
5. Runtime integration/concurrency testing requires an explicitly isolated disposable local/test database.

## Final gate

```text
CANCELLATION AUTH = PASS
STATUS TRANSITION = BLOCKED
RESTOCK EXACTLY ONCE = BLOCKED
TRANSACTION ATOMICITY = BLOCKED
CONCURRENT CANCEL = BLOCKED
STOCK HISTORY = BLOCKED
PAYMENT INTERACTION = PASS
ERROR SAFETY = PASS (static)
TESTS = PASS (60 passed, 0 failed)
TYPECHECK = PASS
LINT = PASS (0 errors, 13 warnings)
PRISMA VALIDATE = PASS
BUILD = BLOCKED (environment: final command timeout; prior worker exit 3221225794 after compilation)

PRODUCTION TOUCHED = NO
PRODUCTION DATA CHANGED = NO
PRODUCTION SCHEMA CHANGED = NO
MIGRATION EXECUTED = NO
DEPENDENCY CHANGED = NO
SECRETS CHANGED = NO
```

**CRITICAL BLOCKERS:** no durable exactly-once restock marker/ledger; no atomic cancellation service; no server-side guarded admin transition; no safe test database for runtime concurrency proof.

Production Ready and Checkout Ready are **not declared**. No commit or push was performed.