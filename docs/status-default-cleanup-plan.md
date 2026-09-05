# AFA STORE — Status/Default Cleanup Plan

**Scope:** audit and plan only; no schema or data was changed.

## Findings

- Canonical `Order.status`: `PENDING`, `PROCESSING`, `PACKED`, `SHIPPED`, `COMPLETED`, `CANCELLED`.
- Canonical payment state: `PENDING`, `PAID`, `EXPIRED`, `CANCELLED`; `Payment.status` is authoritative and `Order.paymentStatus` is a compatibility projection.
- Prisma still declares `Order.status @default("pending")` and `Order.paymentStatus @default("WAITING_PAYMENT")`.
- The only audited order-creation path (`src/app/api/checkout/order/route.ts`) explicitly writes both values as `PENDING`; it does not rely on these defaults.
- Admin has lowercase/legacy compatibility reads and payment-proof UI accepts `WAITING_*` display compatibility. These are not canonical write authority.
- Whether Production rows contain lowercase or `WAITING_*` values is **UNKNOWN** because row data was intentionally not queried.

## Application compatibility

Before changing defaults, inventory every direct SQL/Supabase/API writer outside the repository and every read filter/report. Keep temporary read normalization for evidenced legacy rows, but prohibit new non-canonical writes. Verify webhook monotonic transitions and payment upload continue to use `Payment.status` as authority. Remove compatibility branches only after backfill verification and an observation window.

## Data backfill (separate reviewed migration)

1. Obtain approved aggregate-only counts grouped by status; do not select customer columns.
2. Define an explicit mapping, expected counts, exceptional/unrecognized values, and owner review.
3. Backfill `orders.status`: `pending` → `PENDING` only when semantics are confirmed.
4. Backfill `orders.payment_status`: `WAITING_PAYMENT`/`WAITING_CONFIRMATION` only to the value derived from authoritative payment evidence; never blindly overwrite terminal states.
5. Reconcile missing/inconsistent Payment records separately and quarantine ambiguity.
6. Verify pre/post counts, unmapped values, and projection consistency.

No data backfill should be bundled with CheckoutIdempotency creation.

## Schema default change (separate migration)

After application and data compatibility gates pass, change the two Order defaults to canonical `PENDING`. Consider status check constraints only in a later migration after all legacy data is clean. The default change does not repair existing rows.

## Rollback

- Application rollback must remain able to read canonical and temporarily supported legacy values.
- Prefer forward-fixing incorrect mappings using preserved pre-change aggregate evidence/audit IDs.
- Reverting defaults affects future omitted writes only and does not undo a backfill.
- Restoring data requires an approved backup/PITR or a reviewed inverse update based on durable audit evidence—not an improvised bulk update.

**Status:** plan complete; Production data evidence and execution approvals remain blocked.