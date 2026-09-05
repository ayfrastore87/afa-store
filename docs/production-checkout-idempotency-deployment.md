# AFA STORE — Production Checkout Idempotency Deployment Runbook

> **Safety notice:** This is a deployment plan only. No command in this document was executed during FASE 2.20-C.10. Production project `jaivvnxpbdiksuqzewdd` must not be migrated until explicit approval is recorded.

## 1. Prerequisites

- Explicit written approval for the additive production migration.
- Confirm the target Supabase project and branch are the intended production target.
- Confirm a current, restorable database backup/PITR policy and an owner for the change window.
- Review `prisma/schema.prisma` and `prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql`.
- Confirm the application release contains the idempotency-aware checkout code and generated Prisma Client.
- Confirm the migration SQL is applied once only and is not mixed with unrelated working-tree changes.
- Confirm no checkout/payment integration test will create production data.

## 2. Backup and safety considerations

The migration is additive and does not update existing rows. Nevertheless, verify that the Supabase backup/PITR capability is available before applying it. Schedule the change with an operator who can stop the application deployment if schema verification fails.

Do not use `db push`, `migrate dev`, `migrate reset`, seed, manual table creation, or ad-hoc DDL. Do not delete or modify existing orders, payments, products, carts, or users.

## 3. Exact migration artifact

The reviewed artifact is:

```text
prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql
```

The proposed command, to be executed only after approval and only against the confirmed target, is:

```text
npx prisma migrate deploy
```

**PROPOSED ONLY — NOT EXECUTED in FASE 2.20-C.10.** The command must run with the approved production environment by the designated operator. Never run it against an unverified `DATABASE_URL`.

## 4. Expected new table

Table: `"CheckoutIdempotency"`

Columns:

- `id` TEXT NOT NULL, primary key
- `key` TEXT NOT NULL, unique
- `userId` TEXT NOT NULL, FK to `users.id`, `ON DELETE CASCADE`
- `orderId` TEXT NULL, unique, FK to `orders.id`, `ON DELETE SET NULL`
- `requestHash` TEXT NOT NULL
- `status` TEXT NOT NULL
- `responsePayload` JSONB NULL
- `createdAt` TIMESTAMP(3) NOT NULL, default current timestamp
- `updatedAt` TIMESTAMP(3) NOT NULL
- `expiresAt` TIMESTAMP(3) NULL

This matches the `CheckoutIdempotency` Prisma model. `id` uses Prisma client-side `cuid()` generation; the SQL artifact intentionally does not alter existing tables.

## 5. Expected indexes and foreign keys

Indexes:

- `CheckoutIdempotency_pkey` on `id`
- `CheckoutIdempotency_key_key` unique on `key`
- `CheckoutIdempotency_orderId_key` unique on `orderId`
- `CheckoutIdempotency_userId_idx` on `userId`
- `CheckoutIdempotency_status_expiresAt_idx` on `(status, expiresAt)`

Foreign keys:

- `CheckoutIdempotency_userId_fkey`: `userId → users.id`, cascade on user deletion
- `CheckoutIdempotency_orderId_fkey`: `orderId → orders.id`, set null on order deletion

## 6. Rollback considerations

There is no automatic rollback script and none should be run destructively during an incident. First preserve evidence and determine whether the migration transaction completed.

Because the table is new and initially contains no historical records, an application rollback should mean reverting the application deployment to a version that does not reference this table **only if no idempotency-aware code has been exposed**. The schema can remain additive while the application release is investigated.

Do not drop the table automatically. A later removal, if ever approved, requires a separate reviewed migration, dependency/code audit, backup confirmation, and explicit approval.

## 7. Application deployment order

1. Review the migration artifact and application diff.
2. Obtain explicit production migration approval.
3. Apply the additive migration using the approved deployment process.
4. Run the read-only table/index/FK verification queries below.
5. Deploy the application code and generated Prisma Client.
6. Verify API health and application logs without issuing a real checkout.
7. Verify idempotency behavior using unit/mocked validation or an isolated non-production environment when available.

The schema must exist before production application instances execute the new checkout route. Keep old application instances from receiving traffic before schema verification is complete.

## 8. Read-only verification queries

Run only after the approved migration, against the confirmed target. These queries are read-only:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'CheckoutIdempotency';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'CheckoutIdempotency'
ORDER BY ordinal_position;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'CheckoutIdempotency'
ORDER BY indexname;

SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = '"CheckoutIdempotency"'::regclass
ORDER BY conname;
```

Expected result: exactly the new table, its declared columns, the primary/unique/secondary indexes, and the two foreign keys. Do not continue if the result is inconsistent.

## 9. Post-deployment verification

- `npx prisma validate` and application health checks pass in the deployment environment.
- Checkout endpoint rejects missing/blank/overlong `Idempotency-Key` with HTTP 400.
- Payment mutation route remains disabled with HTTP 403.
- Midtrans webhook signature verification remains enabled.
- Application logs contain no Prisma schema errors or credential leakage.
- No real production checkout, order, payment, stock mutation, or dummy data is used for validation.
- Monitor checkout errors, transaction conflicts, stock conflicts, and Midtrans failures after release.

## 10. Emergency rollback strategy

If table creation fails before application deployment:

1. Stop the deployment.
2. Capture the migration/operator error.
3. Verify existing checkout routes remain on the previous application version.
4. Do not retry blindly and do not manually create/drop the table.
5. Resolve the schema issue through a reviewed migration process.

If application deployment fails after the table is verified:

1. Stop rollout and route traffic to the last known-good application version if operationally required.
2. Leave the additive table in place; do not delete data or drop the table automatically.
3. Confirm the previous application version does not reference `CheckoutIdempotency`.
4. Review logs and migration/application compatibility before another release.

If an idempotency request is observed in `PROCESSING`, do not create a manual order or payment. Investigate the attempt and transaction state through approved read-only operational tooling. Payment status remains controlled by the Midtrans webhook.

## Current FASE 2.20-C.10 state

- Migration executed: **NO**
- Production schema changed: **NO**
- Production data changed: **NO**
- Production order/payment created: **NO**
- This document contains proposed commands only.