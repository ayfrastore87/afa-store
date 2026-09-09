# Production Column Inventory

**SOURCE:** Previously verified Production metadata

**EVIDENCE TYPE:** Production catalog metadata

**DATA ACCESS:** No business rows

**DATABASE MUTATION:** None

## Status

**Inventory status:** `PARTIAL`

The 19-table membership is `VERIFIED`. Complete per-column output for all tables is not present in accessible project/conversation context. Missing details remain `UNKNOWN` and are not reconstructed from Prisma or migration SQL.

| Table | Column evidence status | Available verified detail |
|---|---|---|
| `addresses` | UNKNOWN | Complete column rows unavailable |
| `banners` | UNKNOWN | Complete column rows unavailable |
| `cart_items` | UNKNOWN | Complete column rows unavailable |
| `categories` | UNKNOWN | Complete column rows unavailable |
| `checkout_histories` | UNKNOWN | Complete column rows unavailable |
| `order_items` | UNKNOWN | Complete column rows unavailable |
| `orders` | PARTIAL | `id text NOT NULL`; remaining column rows unavailable |
| `parcel_packages` | UNKNOWN | Complete column rows unavailable |
| `password_reset_tokens` | UNKNOWN | Complete column rows unavailable |
| `payments` | UNKNOWN | Complete column rows unavailable |
| `products` | UNKNOWN | Complete column rows unavailable |
| `promotions` | UNKNOWN | Complete column rows unavailable |
| `settings` | UNKNOWN | Complete column rows unavailable |
| `stock_history` | UNKNOWN | Complete column rows unavailable |
| `testimonials` | UNKNOWN | Complete column rows unavailable |
| `user_vouchers` | UNKNOWN | Complete column rows unavailable |
| `users` | VERIFIED | Detailed below |
| `vouchers` | UNKNOWN | Complete column rows unavailable |
| `wishlists` | UNKNOWN | Complete column rows unavailable |

## Verified `public.users` columns

| Column | PostgreSQL type | Nullable | Default | Identity/generated | Status |
|---|---|---:|---|---|---|
| `id` | `text` | NO | none | NO / NO | VERIFIED |
| `name` | `text` | NO | none | UNKNOWN | VERIFIED except identity/generated |
| `email` | `text` | NO | none | UNKNOWN | VERIFIED except identity/generated |
| `phone` | `text` | YES | none | UNKNOWN | VERIFIED except identity/generated |
| `passwordHash` | `text` | YES | none | UNKNOWN | VERIFIED except identity/generated |
| `image` | `text` | YES | none | UNKNOWN | VERIFIED except identity/generated |
| `role` | `text` | NO | `'customer'::text` | UNKNOWN | VERIFIED except identity/generated |
| `isActive` | `boolean` | NO | `true` | UNKNOWN | VERIFIED except identity/generated |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` | UNKNOWN | VERIFIED except identity/generated |
| `updatedAt` | `timestamp without time zone` | NO | none | UNKNOWN | VERIFIED except identity/generated |
| `auth_id` | `uuid` | YES | none | UNKNOWN | VERIFIED except identity/generated |

Important verified facts: `users.id` is the text primary-key column with no database default and is not identity/generated; `users.auth_id` is nullable UUID.