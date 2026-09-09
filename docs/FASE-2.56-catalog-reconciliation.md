# FASE 2.56 — Catalog Reconciliation

**Mode:** repository-only reconciliation; no database connection or SQL execution
**Production touched:** `NO`
**Evidence result:** `PASS` for the requested three-table catalog scope

## 1. Exact evidence provenance

The sole new Production source for this reconciliation is the stored, authorized, read-only SQL Editor result:

- artifact: `docs/production-evidence/FASE-2.55-one-shot-catalog-result.md`;
- source declared by artifact: Authorized Supabase Production SQL Editor;
- query mode declared by artifact: `READ ONLY`;
- exact payload boundary: bytes after the provenance header ending `Query mode:\nREAD ONLY\n\n`;
- payload SHA-256: `fdabfd756e9bb655b86880865493eb678fae92d884669849ead80e27e065c06d`;
- payload bytes: `34878`;
- Markdown table lines: `64` (header, separator, and 62 result rows);
- exact payload match: `PASS`;
- truncation marker: none.

No Prisma schema, TypeScript, application code, or migration SQL was used as a substitute for Production evidence. `VERIFIED ABSENT` below is used only where the complete column/constraint/index result for these three scoped tables demonstrates absence. A missing feature outside that result's scope remains `UNKNOWN` or `INCOMPLETE`.

## 2. `order_items`

### Columns and timestamp availability

| Fact | Exact observed value | Classification |
|---|---|---|
| `id` | `text` / `text`, `NOT NULL`, no default, PK, not identity, generated `NEVER` | VERIFIED |
| `orderId` | `text` / `text`, `NOT NULL`, no default, not identity, generated `NEVER` | VERIFIED |
| `productId` | `text` / `text`, nullable, no default, not identity, generated `NEVER` | VERIFIED |
| `quantity` | `integer` / `int4`, `NOT NULL`, no default, not identity, generated `NEVER` | VERIFIED |
| timestamp column | No timestamp column occurs in the complete scoped `order_items` column rows | VERIFIED ABSENT |

The full observed column set is `id`, `orderId`, `productId`, `name`, `quantity`, `price`, and `subtotal`. The evidence proves `NOT NULL` checks for `id`, `orderId`, `name`, `quantity`, `price`, and `subtotal`; it does not establish a positive-quantity CHECK. Therefore a positive quantity constraint is **VERIFIED ABSENT** within this complete scoped CHECK result.

### Keys, foreign keys, and indexes

| Fact | Exact observed value | Classification |
|---|---|---|
| PK | `id`; backing `CREATE UNIQUE INDEX order_items_pkey ... USING btree (id)` | VERIFIED |
| `orderId` FK | `order_items_orderId_fkey`: `orderId → orders.id`; update `CASCADE`; delete `RESTRICT` | VERIFIED |
| `productId` FK | `order_items_productId_fkey`: `productId → products.id`; update `CASCADE`; delete `SET NULL` | VERIFIED |
| indexes | Only `order_items_pkey` occurs in the complete scoped index result | VERIFIED |
| additional UNIQUE | No additional unique index/constraint occurs | VERIFIED ABSENT |

## 3. `products`

### Requested columns

| Fact | Exact observed value | Classification |
|---|---|---|
| `id` | `text` / `text`, `NOT NULL`, no default, PK, not identity, generated `NEVER` | VERIFIED |
| `categoryId` | `text` / `text`, nullable, no default, not identity, generated `NEVER` | VERIFIED |
| `stock` | `integer` / `int4`, `NOT NULL`, default `0`, not identity, generated `NEVER` | VERIFIED |
| `createdAt` | `timestamp without time zone` / `timestamp`, `NOT NULL`, default `CURRENT_TIMESTAMP`, not identity, generated `NEVER` | VERIFIED |
| `updatedAt` | No such column occurs in the complete scoped column result | VERIFIED ABSENT |

The complete observed column set is `id`, `badge`, `rating`, `isActive`, `createdAt`, `categoryId`, `name`, `slug`, `flavor`, `size`, `price`, `stock`, and `image`. This exact evidence also establishes every listed column's physical type, nullability, default, identity state, and generated state. It proves a `stock IS NOT NULL` check but no non-negative-stock CHECK; such a CHECK is **VERIFIED ABSENT** in the scoped result.

### Keys, foreign keys, and indexes

| Fact | Exact observed value | Classification |
|---|---|---|
| PK | `id`; backing `CREATE UNIQUE INDEX products_pkey ... USING btree (id)` | VERIFIED |
| UNIQUE | `slug`; `CREATE UNIQUE INDEX products_slug_key ... USING btree (slug)` | VERIFIED |
| FK | `products_categoryId_fkey`: `categoryId → categories.id`; update `CASCADE`; delete `SET NULL` | VERIFIED |
| indexes | `products_pkey (id)` and `products_slug_key (slug)` only | VERIFIED |
| identity/generated | All observed columns: identity `NO`, generated `NEVER` | VERIFIED |

## 4. `stock_history`

### Requested columns

| Fact | Exact observed value | Classification |
|---|---|---|
| `id` | `bigint` / `int8`, `NOT NULL`, PK, identity `YES ALWAYS`, generated `NEVER`; no textual default returned | VERIFIED |
| `product_id` | `text` / `text`, `NOT NULL`, no default, not identity, generated `NEVER` | VERIFIED |
| `quantity` | `integer` / `int4`, `NOT NULL`, default `0`, not identity, generated `NEVER` | VERIFIED |
| `transaction_type` | `text` / `text`, `NOT NULL`, no default, not identity, generated `NEVER` | VERIFIED |
| `stock_before` | `integer` / `int4`, `NOT NULL`, default `0`, not identity, generated `NEVER` | VERIFIED |
| `stock_after` | `integer` / `int4`, `NOT NULL`, default `0`, not identity, generated `NEVER` | VERIFIED |
| `created_at` | `timestamp with time zone` / `timestamptz`, nullable, default `now()`, not identity, generated `NEVER` | VERIFIED |

The complete observed columns additionally include `product_name text NOT NULL`, nullable `note text`, and nullable `created_by text`.

### Keys, FK, CHECK, and indexes

| Fact | Exact observed value | Classification |
|---|---|---|
| PK | `id`; backing `CREATE UNIQUE INDEX stock_history_pkey ... USING btree (id)` | VERIFIED |
| product FK | `fk_stock_product`: `product_id → products.id`; update `NO ACTION`; delete `CASCADE` | VERIFIED |
| transaction CHECK | Allows exactly `IN`, `OUT`, `SALE`, `RETURN`, `ADJUSTMENT` | VERIFIED |
| quantity positivity CHECK | No such CHECK occurs in the complete scoped CHECK result | VERIFIED ABSENT |
| indexes | PK on `id`; `idx_stock_product` btree on `product_id`; `idx_stock_created` btree on `created_at DESC` | VERIFIED |
| business operation identity/order reference | No order, order-item, or cancellation-operation identity column/index occurs | VERIFIED ABSENT |

The existing `stock_history` product FK's delete `CASCADE` can remove history when a product is deleted. That is verified current metadata, not approval to reuse this table as the durable cancellation deduplication authority.

## 5. Migration A compatibility (static only)

Artifact: `prisma/migrations/20260905000000_add_checkout_idempotency/migration.sql`
Verified SHA-256: `8290669ccc69fd9c37edaf6279c0c636550ccc7d93021ad3f6b85e40382c242c`

| Check | Result | Evidence/restriction |
|---|---|---|
| `users.id` | PASS | Existing verified evidence: `text NOT NULL`, PK, non-identity/non-generated; compatible with `userId TEXT NOT NULL` |
| `orders.id` | PASS | Existing verified evidence: `text NOT NULL`, PK; compatible with nullable `orderId TEXT` |
| referenced keys | PASS | Both target IDs are verified primary keys |
| FK compatibility | PASS (structural) / REQUIRE REVIEW (policy) | Types and references fit; `users` delete `CASCADE` and `orders` delete `SET NULL` still require retention acceptance |
| unique `orderId` | PASS (static) | Nullable unique index is internally valid and allows multiple nulls but at most one non-null claim per order |
| index compatibility | INCOMPLETE | Artifact definitions are internally consistent, but immediate target-wide object-name absence, owners/grants and complete namespace collision preflight are unavailable |

The catalog evidence improves unrelated inventory metadata but does not clear baseline/history, retention, immediate preflight, disposable rehearsal, or explicit execution approval gates.

```text
MIGRATION A COMPATIBILITY = BLOCKED
MIGRATION A = NOT EXECUTED
```

## 6. Migration B conceptual compatibility

No Migration B SQL exists or is created here.

| Required fact | Evidence result | Compatibility assessment |
|---|---|---|
| `products.id` | `text`, PK | VERIFIED / compatible product target |
| `products.stock` | `int4 NOT NULL DEFAULT 0` | VERIFIED; atomic arithmetic representation available |
| `order_items.id` | `text`, PK | VERIFIED / compatible line target |
| `order_items.productId` | nullable `text`; FK to `products.id`, update CASCADE/delete SET NULL | VERIFIED; null lines require fail-closed/manual-review handling |
| `order_items.quantity` | `int4 NOT NULL`, no default | VERIFIED; positive-value CHECK is VERIFIED ABSENT |
| `stock_history.id` | `int8`, identity ALWAYS, PK | VERIFIED; not suitable as cancellation operation identity |
| `stock_history.product_id` | `text NOT NULL`, FK to `products.id`, update NO ACTION/delete CASCADE | VERIFIED; delete behavior is not audit-preserving |
| `stock_history.quantity` | `int4 NOT NULL DEFAULT 0` | VERIFIED; positive-value CHECK is VERIFIED ABSENT |
| `stock_history.transaction_type` | `text NOT NULL`; CHECK includes `RETURN` | VERIFIED |
| quantity representation | Existing stock/order/history quantities are all `int4` | VERIFIED |
| timestamp representation | Products use non-null timestamp without time zone; history uses nullable timestamptz default `now()`; order items have no timestamp | VERIFIED, but a new ledger's exact timestamp contract remains REQUIRE REVIEW |
| product FK compatibility | Text IDs are type/key compatible | VERIFIED; future ledger delete/update actions REQUIRE APPROVAL |
| order/order-item FK compatibility | `orders.id` and `order_items.id` are text PKs; current order-item→order FK is verified | VERIFIED; future ledger actions REQUIRE APPROVAL |

Catalog prerequisites for the named existing physical fields are now available. Migration B nevertheless remains conceptual: its own physical columns/types/checks/defaults/indexes, audit-preserving FK actions, line-level unique implementation, actor retention, hard deletion, technical/business approvals, disposable rehearsal, and authoring approval remain unresolved.

```text
MIGRATION B CATALOG COMPATIBILITY = PASS
MIGRATION B COMPATIBILITY = REQUIRE REVIEW
MIGRATION B = NOT AUTHORED / NOT EXECUTED
```

## 7. Baseline/history review

The existing preservation strategy remains unchanged:

- exactly 19 Production `public` tables;
- Supabase-managed/external `auth.users` is excluded;
- preserve `public.users.auth_id → auth.users.id` as a public-side cross-schema dependency;
- preserve Production-only `parcel_packages` and `stock_history`;
- preserve verified RLS, zero-policy, function, and trigger evidence;
- `CheckoutIdempotency` remains absent from Production and future-migration-only;
- `_prisma_migrations` remains absent from Production;
- historical schema is not replayed as DDL;
- no executable baseline is created.

The targeted one-shot catalog resolves many inventory-table metadata gaps, but it is not a complete catalog/ownership export for all 19 tables and related objects. Explicit operational history approval, ownership/ACL completeness, and disposable reconstruction remain absent.

```text
BASELINE/HISTORY STRATEGY = REQUIRE APPROVAL
BASELINE READY = NO
EXECUTABLE BASELINE = NOT CREATED
```

## 8. Reconciliation gate

```text
CATALOG RECONCILIATION = PASS
CONFLICT = NONE OBSERVED IN THE SCOPED EVIDENCE
PRODUCTION TOUCHED = NO
PRODUCTION DATA CHANGED = NO
PRODUCTION SCHEMA CHANGED = NO
```

This catalog pass is evidence reconciliation only. It grants no technical, business, migration, or Production execution approval.