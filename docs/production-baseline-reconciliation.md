# AFA Store — Production Baseline Reconciliation

**Phase:** FASE 2.45-K
**Mode:** strict read-only / repository-only
**Result:** **CONFLICT — STOPPED, NOT READY**

This report is a static comparison of repository documentation. It is not executable SQL, is not a migration, and does not authorize a database operation. No Prisma schema or local migration SQL was used to establish a Production fact.

## A. Evidence used

Repository evidence reviewed:

- `docs/production-baseline-artifact.md`
- `docs/production-schema-manifest.md`
- `docs/production-ownership-manifest.md`
- `docs/production-drift-matrix-final.md`
- `docs/production-schema-inventory.md`
- `docs/fase-2.36-production-metadata-concurrency-gate.md`
- `docs/production-baseline-plan.md`
- `docs/schema-ownership.md` (ownership policy only)

The baseline artifact and manifest refer to a **FASE 2.45-I Master Production Inventory**, but that source document and separate Production column, constraint, and index inventories are not present in the repository. The available `production-schema-inventory.md` says no approved metadata-only Production export was supplied and classifies table membership, columns, constraints, indexes, functions, triggers, and dependencies as `UNKNOWN`.

This conflicts with the FASE 2.45-J artifacts, which label several of those facts verified. Per the fail-closed rule, this report does not choose either claim. Local Prisma and migration SQL were excluded as Production evidence.

## B. 19-table reconciliation

The baseline artifact enumerates exactly these 19 `public` tables:

| # | Table | Artifact treatment | Available inventory result | Reconciliation |
|---:|---|---|---|---|
| 1 | `addresses` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 2 | `banners` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 3 | `cart_items` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 4 | `categories` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 5 | `checkout_histories` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 6 | `order_items` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 7 | `orders` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 8 | `parcel_packages` | Production-only | Not listed individually in available ledger | CONFLICT / UNVERIFIED SOURCE |
| 9 | `password_reset_tokens` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 10 | `payments` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 11 | `products` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 12 | `promotions` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 13 | `settings` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 14 | `stock_history` | Production-only | Existence UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 15 | `testimonials` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 16 | `user_vouchers` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 17 | `users` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 18 | `vouchers` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |
| 19 | `wishlists` | Existing | UNKNOWN | CONFLICT / UNVERIFIED SOURCE |

The artifact does not omit `parcel_packages` or `stock_history`; both are explicitly preserved as Production-only. No extra historical table is included. Nevertheless, complete table membership cannot pass reconciliation until the referenced FASE 2.45-I evidence is available.

## C. Column reconciliation

The schema manifest records detailed `users` columns and partial `orders.id` metadata. The available Production inventory says **all** columns, types, nullability, and defaults are UNKNOWN. Therefore:

- `users.auth_id uuid NULL` is **claimed verified by the manifest but conflicts with the available ledger**;
- the remaining `users` column details are likewise unresolved;
- `orders.id text NOT NULL` is unresolved;
- complete columns for the other 18 tables remain UNKNOWN;
- identity/generated state remains incomplete.

No column was inferred from Prisma.

## D. Constraint reconciliation

The manifest claims `users_pkey`, `users_email_unique`, `users_auth_id_unique`, `users_auth_fk`, `orders_pkey`, and uniqueness of `orders.invoice`. The available constraint inventory is not present, while `production-schema-inventory.md` says all PK, FK, UNIQUE, CHECK, exclusion constraints, and FK actions are UNKNOWN.

Consequently all named Production constraint claims are **CONFLICT / UNRESOLVED EVIDENCE**, not approved baseline definitions. In particular:

- `users_auth_fk` and its claimed `ON DELETE CASCADE` cannot be promoted into DDL;
- its `ON UPDATE` action is unknown even in the manifest;
- `products.categoryId` must not be treated as a Production FK merely because an application relation may exist;
- all remaining FK actions and CHECK constraints remain UNKNOWN.

## E. Index reconciliation

The repository evidence bundle now includes `docs/production-evidence/production-indexes.md`. It is `PARTIAL`: complete index definitions, access methods, predicates, expressions, and constraint-backing metadata remain `UNKNOWN`.

For `users.phone`, the available verified Production index evidence is `users_phone_key UNIQUE(phone)`. Prisma declares `phone @unique`; classification is **MATCH** and risk is **LOW**.

Production `users.phone` uniqueness is verified by the repository evidence bundle:
`docs/production-evidence/production-indexes.md`

Previous classification was superseded by newer verified Production index evidence.

## F. RLS/policy reconciliation

The baseline artifact preserves these claimed Production facts:

- `cart_items`: RLS ON;
- `payments`: RLS ON;
- `stock_history`: RLS ON;
- public policies: 0;
- forced-RLS state: UNKNOWN for every table.

These are internally consistent across the four FASE 2.45-J artifacts. They conflict with the older available ledger, which has no approved RLS metadata. They remain preserved claims pending the missing FASE 2.45-I source and must not be converted into executable statements.

## G. Function/trigger reconciliation

The artifact and manifest preserve:

- `public.update_updated_at_column()`;
- `public.parcel_packages.update_parcel_packages_updated_at`.

They are not omitted and no additional function or trigger was invented. Their existence/definition claims conflict with the available ledger, which marks all functions and triggers UNKNOWN. Function owner/ACL and exact trigger metadata remain unknown. The SQL body shown in the manifest is evidence documentation only.

## H. Cross-schema reconciliation

The artifact excludes `auth.users` from application DDL and records `public.users(auth_id) → auth.users(id)` only as a public-side cross-schema dependency. It does not attempt to create `auth.users`.

The ownership boundary is internally consistent. The dependency's Production existence, exact definition, owner, and actions remain conflicted/unresolved because the available inventory calls it UNKNOWN while the newer artifacts call it verified.

## I. Ownership reconciliation

- No existing `public` object is promoted from UNKNOWN to APPLICATION-OWNED.
- `auth.users`, other Supabase-managed schemas, `storage.*`, and `extensions.*` remain managed/external and excluded.
- `parcel_packages`, `stock_history`, the update function, and parcel trigger retain UNKNOWN catalog ownership.
- Location in `public`, Prisma mapping, and historical SQL are not treated as ownership evidence.

Ownership handling is internally consistent, but incomplete ownership blocks executable baseline readiness.

## J. Confirmed drift

The drift matrix labels the following confirmed:

- `users.auth_id`;
- `users_auth_id_unique`;
- `users_auth_fk`;
- zero Production policies versus a local historical policy artifact.

Because the underlying FASE 2.45-I column/constraint inventories are absent and the available ledger marks these UNKNOWN, these classifications cannot be independently reconciled. They are retained as **artifact-claimed confirmed drift, evidence conflict**. They are not authorization to generate DDL.

`users.phone` is not in the confirmed-drift set. Production has `users_phone_key UNIQUE(phone)`, Prisma declares `phone @unique`, and the reconciled classification is **MATCH** with **LOW** risk.

## K. Candidate drift

| Area | Classification | Reason |
|---|---|---|
| `users.phone` uniqueness | MATCH / LOW | Production `users_phone_key UNIQUE(phone)` matches Prisma `phone @unique` |
| `products.categoryId` FK | UNKNOWN / CANDIDATE DRIFT | No Production constraint evidence |
| Remaining columns/defaults | UNKNOWN | Complete column inventory absent |
| Remaining PK/UNIQUE/FK/CHECK constraints | UNKNOWN | Constraint inventory absent |
| Remaining indexes | UNKNOWN | Index inventory absent |
| Identity/generated state | UNKNOWN | Incomplete evidence |
| Cross-schema dependencies | UNKNOWN | Complete dependency inventory absent |

## L. Production-only

Artifact-classified Production-only objects/behavior, all preserved and not omitted:

- `public.parcel_packages`;
- `public.stock_history`;
- RLS on `cart_items`, `payments`, and `stock_history`;
- zero public policies;
- `public.update_updated_at_column()`;
- `public.parcel_packages.update_parcel_packages_updated_at`;
- `users.auth_id`, `users_auth_id_unique`, and `users_auth_fk` as Production-specific metadata.

Their final catalog verification is blocked by the evidence conflict described above.

## M. Prisma-only

- `public."CheckoutIdempotency"`: artifact-classified ABSENT in Production and FUTURE in the repository; excluded from historical baseline.

No Prisma schema or migration SQL was inspected to manufacture Production facts. No other Prisma-only object was promoted into baseline scope.

## N. Baseline INCLUDE list

There is **no executable INCLUDE list approved for DDL**. The non-executable preservation candidate list is the 19 tables in section B plus the RLS/function/trigger/cross-schema behavior in sections F–H. Inclusion remains conditional on exact definition and ownership evidence.

## O. Baseline EXCLUDE list

- `auth.users` and the entire application-unowned `auth` lifecycle;
- `storage.*`;
- `extensions.*` and extension-owned objects;
- other Supabase-managed schemas and objects;
- `public."CheckoutIdempotency"` from historical baseline;
- `_prisma_migrations` as a Production business-schema object;
- every object whose existence, exact definition, or ownership is unsupported.

## P. Future migration list

1. Future approved Production baseline — not created; blocked.
2. `20260905000000_add_checkout_idempotency` — separate additive future migration; excluded from baseline and not executed.

There is no baseline DDL for `CheckoutIdempotency`.

## Q. Remaining UNKNOWN

- Authoritative FASE 2.45-I Master Production Inventory source document.
- Complete Production column inventory for all 19 tables.
- Complete PK, UNIQUE, FK, CHECK, exclusion, and FK-action inventory.
- Complete index inventory and exact definitions beyond the verified `users_phone_key UNIQUE(phone)` fact.
- Exact ownership and grants for existing public objects.
- Exact function owner/ACL and trigger definition/enabled state.
- Forced-RLS state for every table.
- Materialized views.
- Custom types, enums, and domains.
- Identity/generated state outside the limited manifest claim.
- Complete cross-schema, storage, and extension dependencies.

Views are claimed as 0 and public sequences as 0 by the FASE 2.45-J manifest, but those claims conflict with the available ledger and require the missing source evidence. No materialized view, sequence, or type was invented.

## R. Dry-run findings

Repository-only checks produced the following:

| Check | Result |
|---|---|
| 19 artifact table entries present | PASS (artifact structure only) |
| `parcel_packages` omitted | NO |
| `stock_history` omitted | NO |
| Invented executable object detected | NO |
| Prisma-only object included historically | NO |
| Supabase-managed object included as application-owned | NO |
| `CheckoutIdempotency` included in baseline | NO |
| Baseline DDL or migration created | NO |
| Artifact reconciles with all accessible Production evidence | **NO — CONFLICT** |

Conflict details:

1. FASE 2.45-J cites a verified FASE 2.45-I inventory that is absent from the repository.
2. The accessible Production ledger says the same metadata is UNKNOWN.
3. Required column, constraint, and index inventories are absent.
4. The former `users.phone` conflict is resolved by `docs/production-evidence/production-indexes.md`: `users_phone_key UNIQUE(phone)` matches Prisma `phone @unique`. Previous classification was superseded by newer verified Production index evidence.

The dry run stopped at evidence reconciliation. No database connection, Prisma migration command, DDL, DML, schema push, environment change, dependency change, commit, or push occurred.

## S. Final readiness assessment

The four baseline artifacts are structurally conservative: they list 19 tables, preserve both Production-only tables and behaviors, exclude managed schemas, and keep `CheckoutIdempotency` outside historical state. The specific `users.phone`/`users_phone_key` documentation conflict is resolved. Complete metadata remains `PARTIAL`/`UNKNOWN`, so this historical report still does not authorize an executable baseline; repository reconciliation may now be retried against the current evidence bundle.

```text
BASELINE ARTIFACT CONSISTENT: NO
DRY-RUN PASS: NO
PRODUCTION TOUCHED: NO
EXECUTABLE BASELINE CREATED: NO
CHECKOUTIDEMPOTENCY IN BASELINE: NO
READY FOR FINAL BASELINE GATE: NO
EVIDENCE STATUS: CONFLICT
```