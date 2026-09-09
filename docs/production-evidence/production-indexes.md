# Production Index Inventory

**SOURCE:** Previously verified Production metadata

**EVIDENCE TYPE:** Production catalog metadata

**DATA ACCESS:** No business rows

**DATABASE MUTATION:** None

## Status

**Inventory status:** `PARTIAL`

The latest verified Production evidence specifically establishes `users_phone_key`. Other available named uniqueness evidence is retained below. Complete index definitions, access methods, predicates, expressions, and constraint-backing metadata are not present in accessible context and remain `UNKNOWN`.

| Table | Index | Unique | Key | Classification | Status |
|---|---|---:|---|---|---|
| `users` | `users_pkey` | YES | `id` | PK-backed | VERIFIED |
| `users` | `users_email_unique` | YES | `email` | Unique evidence | VERIFIED |
| `users` | `users_auth_id_unique` | YES | `auth_id` | Unique evidence | VERIFIED |
| `users` | `users_phone_key` | YES | `phone` | `users.phone @unique` = **MATCH** | VERIFIED |
| `orders` | `orders_pkey` | YES | `id` | PK-backed | VERIFIED |
| `orders` | `orders_invoice_key` | YES | `invoice` | `orders.invoice` uniqueness = MATCH | VERIFIED |

`users.phone` is not confirmed drift. The verified Production `UNIQUE(phone)` evidence resolves it as **MATCH**.

| Remaining metadata | Status |
|---|---|
| Complete index inventory for all 19 tables | UNKNOWN |
| Exact index definitions/access methods | UNKNOWN |
| Predicates and expressions | UNKNOWN |
| Constraint-backing classification except where stated | UNKNOWN |