# SALES FIELD VISIT IMPLEMENTATION REPORT

## 1. Existing architecture audit

The repository already has one Sales & Titip Jual foundation. It uses `SalesPerson`,
`ConsignmentStore`, `ConsignmentStock`, `SalesVisit`, `SalesVisitItem`,
`StorePayment`, and `Product`; it does not create an `Order` for a visit.

Existing routes include assigned-store listing/detail, atomic visit creation,
sales visit history, payment handling, admin consignment reports, and admin
store/sales dashboards. Existing authorization derives the SalesPerson from the
authenticated application user and filters stores by `assignedSalesId`.

## 2. Files changed

- `prisma/migrations/20260927010000_add_sales_visit_location_metadata/migration.sql`
- This report.

No application route or production data was changed because the required schema
review gate below is not yet approved.

## 3. Schema requirements

Existing `SalesVisit` fields: `latitude`, `longitude`, and `photoUrl`.

Missing fields required by the requested workflow:

- `locationAccuracy DOUBLE PRECISION NULL`
- `locationCapturedAt TIMESTAMP(3) NULL`

Photo binary/base64 storage is not required; `photoUrl` is already available.

## 4. Migration required yes/no

**YES — additive migration artifact created, not executed.**

The artifact only adds the two nullable GPS metadata columns. No `prisma db
push`, `prisma migrate dev`, `prisma migrate deploy`, reset, or production
database operation was run.

Per the project instruction, implementation stops here for schema review.

## 5–20. Implementation status

| Area | Status before schema approval |
|---|---|
| GPS implementation | Existing latitude/longitude persistence; accuracy/capturedAt pending schema approval |
| GPS validation | Existing latitude/longitude Zod range validation; accuracy validation pending |
| Photo capture | Not added in this gated change |
| Photo resize/compression | Not added in this gated change |
| Final photo maximum size | Existing admin upload patterns are separate; SalesVisit upload pending |
| Storage implementation | Existing Supabase admin storage helper is reusable; no bucket/configuration created |
| Product/stock recording | Existing server-authoritative transaction and optimistic stock guard |
| Money/payment recording | Existing integer-Rupiah server calculation and StorePayment transaction |
| Receivable calculation | Existing derived `COMPLETED` sales minus `VALID` payments |
| Atomic transaction | Existing visit/items/stock/payment transaction |
| Idempotency | Existing unique `SalesVisit.idempotencyKey` protection |
| Authorization | Existing assigned-store and current-sales filters |
| Sales history | Existing `GET /api/sales/visits` for the current SalesPerson |
| Admin visit detail | Existing report foundation; richer GPS/photo detail pending implementation |
| Night mode/mobile UX | Existing Sales shell and mobile-first wizard |
| Prisma pool safety | Existing shared Prisma singleton retained; no new client/pool added |

## 21. Tests added

None in this gated change. Application tests should be added only after the
schema artifact is reviewed and the final API contract is approved.

## 22–25. Validation

Not run for application implementation because the required schema change is
awaiting review. The migration artifact was intentionally not executed.

## 26. Git status

The repository contains pre-existing unrelated working-tree changes from the
prior task. No commit or push was performed.

## 27. Remaining risks/pending migration

1. Review the additive migration against the actual Production schema.
2. After approval/application in the intended deployment process, implement
   server validation and persistence for accuracy/capturedAt.
3. Then implement photo processing/upload, visit UI steps, admin detail, and
   the focused tests requested in the specification.

## Result

**SALES FIELD VISIT: NOT READY**

Reason: required additive schema fields need review before application work can
be safely enabled.