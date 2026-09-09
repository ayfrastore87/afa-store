# AFA Store — Production Schema Manifest

**Evidence basis:** FASE 2.45-I
**Manifest status:** **INCOMPLETE — DO NOT GENERATE DDL**

This manifest records only verified Production metadata. `UNKNOWN — NOT VERIFIED` is intentional and must not be filled from Prisma or repository migrations.

## Relation inventory

| Table | Columns | Constraints | Indexes | RLS | Owner | Notes |
|---|---|---|---|---|---|---|
| `addresses` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `banners` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `cart_items` | UNKNOWN | UNKNOWN | UNKNOWN | ON | UNKNOWN | Zero verified public policies |
| `categories` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `checkout_histories` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `order_items` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `orders` | Partial: `id text NOT NULL` | `orders_pkey` exists; `invoice` unique | Exact definitions UNKNOWN | OFF | UNKNOWN | Remaining metadata unknown |
| `parcel_packages` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Production-only; verified update trigger |
| `password_reset_tokens` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `payments` | UNKNOWN | UNKNOWN | UNKNOWN | ON | UNKNOWN | Zero verified public policies |
| `products` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | `categoryId` FK not verified |
| `promotions` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `settings` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `stock_history` | UNKNOWN | UNKNOWN | UNKNOWN | ON | UNKNOWN | Production-only; zero verified policies |
| `testimonials` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `user_vouchers` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `users` | Verified below | Verified below | Partial | OFF | UNKNOWN | Cross-schema Auth dependency |
| `vouchers` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |
| `wishlists` | UNKNOWN | UNKNOWN | UNKNOWN | OFF | UNKNOWN | Existing base table |

Forced-RLS state is unknown for every table.

## Verified `users` columns

| Column | Type | Nullable | Default | PK | Unique | FK | Identity/generated |
|---|---|---:|---|---:|---:|---|---|
| `id` | `text` | NO | none | YES | PK-backed | none verified | NO / NO |
| `name` | `text` | NO | none | NO | not verified | none verified | UNKNOWN |
| `email` | `text` | NO | none | NO | YES | none verified | UNKNOWN |
| `phone` | `text` | YES | none | NO | YES — `users_phone_key UNIQUE(phone)` | none verified | UNKNOWN |
| `passwordHash` | `text` | YES | none | NO | not verified | none verified | UNKNOWN |
| `image` | `text` | YES | none | NO | not verified | none verified | UNKNOWN |
| `role` | `text` | NO | `'customer'::text` | NO | not verified | none verified | UNKNOWN |
| `isActive` | `boolean` | NO | `true` | NO | not verified | none verified | UNKNOWN |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` | NO | not verified | none verified | UNKNOWN |
| `updatedAt` | `timestamp without time zone` | NO | none | NO | not verified | none verified | UNKNOWN |
| `auth_id` | `uuid` | YES | none | NO | YES | `auth.users(id)`, delete CASCADE | UNKNOWN |

Verified constraint names are `users_pkey`, `users_email_unique`, `users_auth_id_unique`, and `users_auth_fk`. Verified Production index evidence additionally establishes `users_phone_key UNIQUE(phone)`; Prisma declares `phone @unique`, so the classification is `MATCH` with `LOW` risk. Exact index definitions and `users_auth_fk` update action remain unknown.

Production `users.phone` uniqueness is verified by the repository evidence bundle:
`docs/production-evidence/production-indexes.md`

Previous classification was superseded by newer verified Production index evidence.

## Other public objects

| Kind | Object/count | Owner | Status |
|---|---|---|---|
| Policies | 0 total | N/A | Verified |
| Function | `public.update_updated_at_column()` | UNKNOWN | Verified existence/definition |
| Trigger | `parcel_packages.update_parcel_packages_updated_at` | follows table; owner UNKNOWN | Verified existence and core behavior |
| Views | 0 | N/A | Verified |
| Materialized views | UNKNOWN | UNKNOWN | Not verified |
| Public sequences | 0 | N/A | Verified |
| Custom types/enums/domains | UNKNOWN | UNKNOWN | Not verified |
| Identity/generated columns | Complete set UNKNOWN | N/A | Only `users.id` is verified non-identity/non-generated |

## Verified function body

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
```

This SQL is evidence documentation, not an execution instruction.

## Missing material evidence

- Complete columns for 18 tables.
- Complete PK, unique, FK, check, and exclusion constraints.
- Complete inbound/outbound FK actions.
- Exact index definitions, predicates, expressions, and constraint backing.
- Owners, grants, identity/generated state, custom types, and materialized views.
- Complete dependencies on `auth`, `storage`, extensions, and other managed schemas.

Until these are obtained through an authorized catalog-only path, this manifest cannot produce an executable baseline.