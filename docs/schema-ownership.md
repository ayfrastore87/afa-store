# AFA STORE — Schema Ownership

**Decision:** OPTION D — HYBRID
**Scope:** ownership policy only; no schema operation was performed.

## Ownership boundary

### Application-owned public business schema

The application owns the intended definitions and future migration history for these Prisma-mapped public tables:

`users`, `addresses`, `categories`, `products`, `wishlists`, `cart_items`, `orders`, `payments`, `order_items`, `vouchers`, `user_vouchers`, `checkout_histories`, `password_reset_tokens`, `testimonials`, `banners`, `promotions`, and `settings`.

`CheckoutIdempotency` is also application-owned, but is only a proposed public table: it is absent from the stated Production baseline and must not be treated as deployed.

`stock_history` is used by application UI and appears in project artifacts, but its exact Production definition and long-term migration ownership remain **UNKNOWN** until read-only metadata is approved and reviewed.

### External schema

`auth.users` and all other objects in Supabase-managed schemas are **SUPABASE MANAGED / EXTERNAL**. They are not part of the application migration chain and must not be recreated, altered, dropped, baselined as application-owned objects, or shadowed by Prisma migrations.

## Migration responsibility

- AFA STORE maintainers own reviewed migrations for the public business schema.
- Supabase owns the `auth` schema and its lifecycle.
- The current pre-Prisma public schema must first be represented by an approved baseline history without executing its historical DDL against the existing database.
- New application schema changes begin as reviewed Prisma migrations only after baseline evidence and migration history are approved.
- Supabase SQL artifacts are historical evidence; they are not proof of current Production state and must not form a second active migration authority.

## Foreign-key boundary

The stated architecture includes a boundary FK from `public.users` to `auth.users`. Its exact columns, actions, name, and current Production existence are **UNKNOWN** pending metadata evidence. Application migrations may preserve an evidenced FK across this boundary, but must not modify the referenced `auth.users` object. All public-to-public FKs remain application-owned after baseline approval.

## Prohibited operations

- No Prisma introspection workaround across `auth`, including `prisma db pull`.
- No `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, data backfill, seed, or migration against Production without a separately approved change.
- No application migration may own or modify Supabase-managed schemas, roles, extensions, auth functions, auth triggers, or auth policies.
- No manual retry clauses or ad-hoc DDL may be added to make a failed migration appear successful.
- No competing Prisma/Supabase migration chains may independently own the same public object.

## Future migration ownership

After exact metadata mapping and baseline approval, the accepted baseline records the already-existing application-owned public objects. Future public business changes are appended to the Prisma migration chain. Supabase platform upgrades continue independently. Cross-boundary FK changes require joint application/Supabase compatibility review.

**Approval state:** strategy selected by FASE 2.35 instruction; operational baseline and Production migration approval remain pending.