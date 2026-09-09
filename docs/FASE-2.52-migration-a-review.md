# FASE 2.52 — Migration A Static Review

**Artifact:** `prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql`
**SHA-256 reviewed:** `8290669ccc69fd9c37edaf6279c0c636550ccc7d93021ad3f6b85e40382c242c`
**Mode:** static review only; no database connection or migration execution
**State:** `CheckoutIdempotency = NOT EXECUTED`

## 1. Artifact inventory

The existing artifact is additive and creates the case-sensitive table `"CheckoutIdempotency"`. It was reviewed as-is and must remain byte-for-byte unchanged.

| Object | Exact artifact design | Static result |
|---|---|---|
| Table | `"CheckoutIdempotency"` | PASS |
| Columns | `id TEXT NOT NULL`; `key TEXT NOT NULL`; `userId TEXT NOT NULL`; `orderId TEXT NULL`; `requestHash TEXT NOT NULL`; `status TEXT NOT NULL`; `responsePayload JSONB NULL`; `createdAt TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`; `updatedAt TIMESTAMP(3) NOT NULL`; `expiresAt TIMESTAMP(3) NULL` | PASS |
| Primary key | `CheckoutIdempotency_pkey (id)` | PASS |
| Unique key | `CheckoutIdempotency_key_key (key)` | PASS — deterministic checkout request claim |
| Order uniqueness | `CheckoutIdempotency_orderId_key (orderId)` | PASS — at most one non-null claim per order; PostgreSQL permits multiple nulls |
| Supporting indexes | `CheckoutIdempotency_userId_idx (userId)`; `CheckoutIdempotency_status_expiresAt_idx (status, expiresAt)` | PASS |
| User FK | `userId → users.id`, `ON DELETE CASCADE`, `ON UPDATE CASCADE` | TYPE COMPATIBLE; deletion policy requires explicit acceptance |
| Order FK | `orderId → orders.id`, `ON DELETE SET NULL`, `ON UPDATE CASCADE` | TYPE COMPATIBLE; deletion policy requires explicit acceptance |

The artifact contains every conceptual checkout field requested: `key`, `userId`, `orderId`, `requestHash`, `status`, `responsePayload`, `createdAt`, `updatedAt`, and `expiresAt`. Its surrogate `id` is additionally required as the primary key. There is no data backfill.

## 2. Verified Production compatibility

Only the repository's verified Production evidence is treated as Production fact:

- `users.id` is verified `text NOT NULL`, primary key, non-identity and non-generated. Therefore artifact `userId TEXT NOT NULL` is type/reference compatible.
- `orders.id` is verified `text NOT NULL` with `orders_pkey`. Therefore artifact nullable `orderId TEXT` is type/reference compatible.
- `CheckoutIdempotency` is verified absent from Production, so the proposed table name does not collide with a known Production table.
- `_prisma_migrations` is verified absent from Production. This is a baseline/history execution blocker; the artifact must not be deployed or resolved until an approved baseline strategy exists.
- Owners, grants/ACLs, complete index metadata, and relevant operational lock characteristics remain unknown. These require precheck/rehearsal evidence.

The `ON DELETE CASCADE` user action removes checkout evidence when an application user is deleted. The `ON DELETE SET NULL` order action preserves a claim but removes its order link. Both are internally valid and already frozen in the artifact, but audit/retention acceptance is required before approval. This review does not alter them.

## 3. Dependency and execution gate

Migration A is schema-independent of Migration B. It does depend operationally on:

1. an approved Production baseline/history strategy because Production has no `_prisma_migrations`;
2. preflight confirmation immediately before any future execution that the table and conflicting object names remain absent;
3. an isolated disposable non-Production rehearsal covering object creation, FK/index definitions, duplicate/concurrent claims, lock behavior, rollback/disable, and old/new application compatibility;
4. explicit retention acceptance for both FK delete actions;
5. separate migration and Production execution approvals.

No historical checkout records are inferred or backfilled. A nullable unique `orderId` is intentional: it permits multiple in-progress claims with no order yet, while preventing multiple claims from binding to one completed order.

## 4. Conclusion

```text
MIGRATION A REVIEW = PASS (static artifact review)
MIGRATION A DESIGN = PASS
SCHEMA TYPE COMPATIBILITY = PASS for users.id and orders.id
FK DELETE POLICY = REVIEW REQUIRED
BASELINE DEPENDENCY = BLOCKED
DISPOSABLE REHEARSAL = BLOCKED
MIGRATION APPROVAL = NOT GRANTED
PRODUCTION EXECUTION = FORBIDDEN / NOT EXECUTED
```

`PASS` applies only to the static design and verified identity compatibility. It is not migration approval and does not override the baseline, retention-policy, rehearsal, or Production gates.