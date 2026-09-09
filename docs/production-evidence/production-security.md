# Production Security Metadata

**SOURCE:** Previously verified Production metadata

**EVIDENCE TYPE:** Production catalog metadata

**DATA ACCESS:** No business rows

**DATABASE MUTATION:** None

## Status

**RLS enabled-state and public policy count:** `VERIFIED`

**Forced-RLS, owners, and grants:** `UNKNOWN`

| Public table | RLS | Status |
|---|---:|---|
| `addresses` | OFF | VERIFIED |
| `banners` | OFF | VERIFIED |
| `cart_items` | ON | VERIFIED |
| `categories` | OFF | VERIFIED |
| `checkout_histories` | OFF | VERIFIED |
| `order_items` | OFF | VERIFIED |
| `orders` | OFF | VERIFIED |
| `parcel_packages` | OFF | VERIFIED |
| `password_reset_tokens` | OFF | VERIFIED |
| `payments` | ON | VERIFIED |
| `products` | OFF | VERIFIED |
| `promotions` | OFF | VERIFIED |
| `settings` | OFF | VERIFIED |
| `stock_history` | ON | VERIFIED |
| `testimonials` | OFF | VERIFIED |
| `user_vouchers` | OFF | VERIFIED |
| `users` | OFF | VERIFIED |
| `vouchers` | OFF | VERIFIED |
| `wishlists` | OFF | VERIFIED |

| Security fact | Value | Status |
|---|---|---|
| Public policies | `0` | VERIFIED |
| Forced-RLS state | Exact per-table values unavailable | UNKNOWN |
| PostgreSQL owners | Unavailable | UNKNOWN |
| Grants/ACLs | Unavailable | UNKNOWN |

Zero public policies is the observed Production state; repository policy SQL is not substituted for this evidence.