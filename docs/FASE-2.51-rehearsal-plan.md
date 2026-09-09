# FASE 2.51 — Non-Production Rehearsal Plan

## 1. Environment gate

Inspection found no verified disposable database, local PostgreSQL runtime, Docker/container runtime, or compose file. Existing `.env`/`.env.local` database variables were not displayed or used; their hosts were not local, so they are not acceptable rehearsal targets. No database connection was attempted. **REHEARSAL = BLOCKED.** Do not create a database automatically and never fall back to `DATABASE_URL`.

An authorized owner must provide an isolated disposable non-Production PostgreSQL target through a secret-safe `TEST_DATABASE_URL` process. It must be distinct from all application/Production URLs, use non-sensitive representative data, have explicit teardown, and be verified before any rehearsal command is considered.

## 2. Separate rehearsal sequence

Rehearse Migration A and Migration B independently. Capture pre/post catalog evidence, artifact checksum, timing/lock observations, constraint/FK/index verification, application compatibility, test output, and teardown evidence. A passing A rehearsal does not approve B.

## 3. Required scenarios

### Schema and safety

- additive schema compatibility and old/new application behavior;
- primary, unique, FK, ownership, grants/RLS, and index verification;
- duplicate operation-key insertion;
- injected failure at each transaction boundary and complete rollback;
- no Production endpoint, credential, data, or URL use.

### Cancellation and inventory

- repeated cancellation request;
- two concurrent cancellation requests;
- exact stock recovery for one and multiple lines;
- same product represented by multiple order lines;
- null `productId`;
- missing/deleted product;
- inactive product under each explicitly approved policy;
- terminal order and already-cancelled order;
- duplicate movement conflict/no-op response;
- exact `RETURN` quantities and no second increment.

### Cross-domain races

- cancellation versus payment webhook;
- cancellation versus payment state update;
- unpaid, paid, expired, and cancelled payment states according to the approved matrix;
- paid cancellation must remain rejected until refund policy and gateway behavior are approved.

## 4. Expected assertions

Exactly one committed line movement exists, stock equals the original decrement plus one recovery, and a failed transaction leaves order, stock, movement, and audit unchanged. Unauthorized/unauthenticated requests produce the classified server response without writes. No browser mutation is used in the rehearsal.

## 5. Implementation contract (not activated)

```text
Browser
  -> POST /api/admin/orders/[id]/cancel
  -> server authentication
  -> admin and active-admin guard
  -> cancellation service
  -> one guarded atomic transaction
  -> InventoryMovement RETURN records
  -> sanitized 401/403/404/409/422/500/503 response
```

The current unsafe mutation is `src/app/admin/page.tsx:361`, where the browser directly updates `orders`. It must be removed or disabled as part of a coordinated future application change. Full mutation implementation is not authorized while business policy and technical approval remain open.

## 6. Rehearsal gate

```text
DISPOSABLE DATABASE = NOT AVAILABLE / NOT VERIFIED
MIGRATION A REHEARSAL = BLOCKED
MIGRATION B REHEARSAL = BLOCKED
RUNTIME CONCURRENCY PROOF = NOT RUN
PRODUCTION TESTING = NO
```

Do not run `prisma migrate`, `prisma migrate deploy`, `prisma migrate resolve`, `prisma db push`, `prisma db pull`, `prisma migrate reset`, or `prisma db seed` as part of this phase.