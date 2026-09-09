# AFA Store — Final Production/Prisma Drift Matrix

**Phase:** FASE 2.45-J
**Status:** final classification from available evidence; metadata remains incomplete

| Area | Production | Prisma/repository | Classification | Risk | Baseline decision |
|---|---|---|---|---|---|
| Public table count | 19 | 17 matching existing models plus future model | CONFIRMED STRUCTURAL GAP | HIGH | Preserve all Production tables |
| `parcel_packages` | Exists | No Prisma model | PRODUCTION-ONLY | HIGH | Preserve; do not infer DDL |
| `stock_history` | Exists | No Prisma model | PRODUCTION-ONLY | HIGH | Preserve; do not infer DDL |
| `CheckoutIdempotency` | Absent | Model/migration artifact exists | PRISMA-ONLY / FUTURE | HIGH | Exclude from baseline |
| `_prisma_migrations` | Absent | Local migration artifact exists | HISTORY GAP | CRITICAL | Do not deploy/resolve in this phase |
| `users.auth_id` | Nullable UUID | Missing | CONFIRMED DRIFT | HIGH | Preserve as Production-specific metadata |
| `users_auth_id_unique` | Exists | Missing | CONFIRMED DRIFT | HIGH | Preserve |
| `users_auth_fk` | References `auth.users(id)`, delete CASCADE | Missing | CONFIRMED DRIFT | HIGH | Preserve public-side dependency only |
| `users.email` unique | Exists | Declared | MATCH | LOW | Preserve |
| `users.phone` unique | `users_phone_key UNIQUE(phone)` | Declared `phone @unique` | MATCH | LOW | Preserve verified uniqueness |
| `orders.invoice` unique | Exists | Declared | MATCH/PARTIAL | LOW | Exact definition still required |
| `products.categoryId` FK | Unknown | Declared relation | UNKNOWN | HIGH | Do not infer |
| Remaining constraints/FKs | Incomplete | Declared in part | UNKNOWN | CRITICAL | Block executable baseline |
| Complete indexes | Incomplete | Declared in part | UNKNOWN | HIGH | Block executable baseline |
| RLS on cart/payments/stock | Enabled | Not modeled | PRODUCTION-ONLY | HIGH | Preserve |
| Public policies | Zero | Local cart policy artifact exists | CONFIRMED ARTIFACT DIFFERENCE | HIGH | Production state wins; do not apply artifact |
| Update function | Exists | Not modeled | PRODUCTION-ONLY | MEDIUM | Preserve after ownership review |
| Parcel trigger | Exists | Not modeled | PRODUCTION-ONLY | HIGH | Preserve after exact review |
| Views | Zero | None | MATCH | LOW | No baseline view DDL |
| Public sequences | Zero | Application text IDs | COMPATIBLE | LOW | Do not invent sequences |
| Materialized views | Unknown | None modeled | UNKNOWN | MEDIUM | Block completeness |
| Identity/generated columns | Mostly unknown | Not fully represented | UNKNOWN | HIGH | Block completeness |
| Custom types/domains | Unknown | Mostly scalar strings | UNKNOWN | HIGH | Block completeness |
| Public object ownership | Unknown | Not modeled | UNKNOWN | CRITICAL | Block executable baseline |
| Storage/extension dependencies | Unknown | Not modeled | UNKNOWN | HIGH | Block completeness |

Production `users.phone` uniqueness is verified by the repository evidence bundle:
`docs/production-evidence/production-indexes.md`

Previous classification was superseded by newer verified Production index evidence.

## Non-destructive reconciliation policy

- Never drop a Production object merely because Prisma omits it.
- Never add a constraint/index merely because Prisma or historical SQL declares it.
- Never include a future object in historical baseline state.
- Never claim Supabase-managed objects as application-owned.
- Resolve drift only from reviewed Production catalog evidence and under a separate change phase.

## Gate

```text
DRIFT MATRIX CREATED: YES
EXECUTABLE BASELINE READY: NO
DESTRUCTIVE RECONCILIATION: NO
```