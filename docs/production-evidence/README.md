# FASE 2.45-K.1 — Production Evidence Bundle

**SOURCE:** Previously verified Production metadata

**EVIDENCE TYPE:** Production catalog metadata

**DATA ACCESS:** No business rows

**DATABASE MUTATION:** None

## Status

**Evidence bundle:** `PARTIAL`

This repository-only bundle reconstructs the Production metadata available in prior verified project context. It is evidence documentation, not SQL, an executable baseline, or authorization to operate on Production. Prisma schema and migration SQL were not used as substitutes for Production evidence.

Status vocabulary:

- `VERIFIED`: the Production fact is available in the previously verified metadata context.
- `PARTIAL`: some metadata for the scope is available, but the complete inventory detail is not present in accessible context.
- `UNKNOWN`: the value is not present in accessible verified context and is not inferred.

## Production identity and boundary

| Fact | Value | Status |
|---|---|---|
| PostgreSQL version | `17.6` | VERIFIED |
| Database | `postgres` | VERIFIED |
| Schema | `public` | VERIFIED |
| Application DB identity | Exact previously verified value is not present in accessible project/conversation context | UNKNOWN |
| Public base-table count | 19 | VERIFIED |
| Production-only tables | `parcel_packages`, `stock_history` | VERIFIED |
| Prisma-only future table | `CheckoutIdempotency` | VERIFIED |
| Absent from Production | `CheckoutIdempotency`, `_prisma_migrations` | VERIFIED |

## Public table boundary

1. `addresses`
2. `banners`
3. `cart_items`
4. `categories`
5. `checkout_histories`
6. `order_items`
7. `orders`
8. `parcel_packages`
9. `password_reset_tokens`
10. `payments`
11. `products`
12. `promotions`
13. `settings`
14. `stock_history`
15. `testimonials`
16. `user_vouchers`
17. `users`
18. `vouchers`
19. `wishlists`

`auth.users` is Supabase-managed and excluded. The verified public-side dependency is retained in [production-constraints.md](production-constraints.md).

## Bundle contents

- [production-columns.md](production-columns.md)
- [production-constraints.md](production-constraints.md)
- [production-indexes.md](production-indexes.md)
- [production-security.md](production-security.md)
- [production-functions-triggers.md](production-functions-triggers.md)

No credentials, connection strings, secrets, business rows, DDL, or DML are included.