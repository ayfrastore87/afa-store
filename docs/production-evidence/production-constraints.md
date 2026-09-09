# Production Constraint Inventory

**SOURCE:** Previously verified Production metadata

**EVIDENCE TYPE:** Production catalog metadata

**DATA ACCESS:** No business rows

**DATABASE MUTATION:** None

## Status

**Inventory status:** `PARTIAL`

Only constraint records available in the verified context are listed. The complete 19-table PK, UNIQUE, FK, action, and CHECK row set is not present in accessible context; omitted constraints are `UNKNOWN`, not absent. Migration SQL is not used as evidence.

| Table | Constraint | Type | Columns | Reference | ON DELETE | ON UPDATE | Status |
|---|---|---|---|---|---|---|---|
| `users` | `users_pkey` | PRIMARY KEY | `id` | — | — | — | VERIFIED |
| `users` | `users_email_unique` | UNIQUE | `email` | — | — | — | VERIFIED |
| `users` | `users_auth_id_unique` | UNIQUE | `auth_id` | — | — | — | VERIFIED |
| `users` | `users_auth_fk` | FOREIGN KEY | `auth_id` | `auth.users(id)` | CASCADE | UNKNOWN | PARTIAL |
| `orders` | `orders_pkey` | PRIMARY KEY | `id` | — | — | — | VERIFIED |
| `orders` | `orders_invoice_key` | UNIQUE | `invoice` | — | — | — | VERIFIED |

## Cross-schema boundary

`public.users.auth_id` → `auth.users.id` with `ON DELETE CASCADE` is verified. `auth.users` remains Supabase-managed and **EXCLUDED**; this bundle records only the public-side dependency and does not claim or define the target.

## CHECK constraints and remaining actions

| Scope | Status | Note |
|---|---|---|
| Complete CHECK inventory | UNKNOWN | Exact verified rows unavailable; none inferred |
| Remaining PK/UNIQUE/FK inventory | UNKNOWN | Exact verified rows unavailable; none inferred |
| `users_auth_fk` ON UPDATE | UNKNOWN | Not present in accessible verified context |
| Remaining FK ON DELETE/ON UPDATE actions | UNKNOWN | Exact verified rows unavailable; none inferred |