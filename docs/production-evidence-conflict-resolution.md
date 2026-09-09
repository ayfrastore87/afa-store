# FASE 2.45-K.2 — Production Evidence Conflict Resolution

**Mode:** repository-only
**Database access:** forbidden and not performed
**Scope:** documentation classification for `users.phone` only

## A. Conflict detected

Legacy active documentation classified `users.phone` uniqueness as `CONFIRMED DRIFT`, unresolved/candidate drift, or not verified. This contradicted the newer repository Production evidence bundle.

## B. Conflicting documents

The directly conflicting statements were in:

- `docs/production-drift-matrix-final.md`
- `docs/production-schema-manifest.md`
- `docs/production-baseline-reconciliation.md`

The derived conflict status in `docs/production-baseline-reconciliation-final.md` was also updated after those sources were aligned.

Previous classification was superseded by newer verified Production index evidence. This historical fact is recorded explicitly rather than silently removed.

## C. Authoritative evidence

Production `users.phone` uniqueness is verified by the repository evidence bundle:
`docs/production-evidence/production-indexes.md`

The verified Production evidence is:

```text
users_phone_key UNIQUE(phone)
```

The evidence bundle itself remains unchanged and its overall index inventory status remains `PARTIAL`.

## D. Resolution

Every active classification directly concerning `users.phone` was aligned to the verified index evidence. No inference was made for unrelated metadata, and no other `PARTIAL` or `UNKNOWN` status was promoted.

No database connection, SQL, DDL, DML, Prisma migration command, schema push, migration creation, environment change, dependency change, commit, or push occurred.

## E. Updated classification

| Side | Fact |
|---|---|
| Production | `users_phone_key UNIQUE(phone)` |
| Prisma | `phone @unique` |
| Classification | `MATCH` |
| Risk | `LOW` |

## F. Unchanged high-risk drift

The following classifications and preservation requirements were not changed:

| Object/fact | Classification | Treatment |
|---|---|---|
| `users.auth_id` | `CONFIRMED DRIFT` | Preserve Production-specific nullable UUID metadata |
| `users_auth_id_unique` | `CONFIRMED DRIFT` | Preserve |
| `users_auth_fk` | `CONFIRMED DRIFT` | Preserve public-side dependency on `auth.users(id)` |

`CheckoutIdempotency` remains absent from Production, `FUTURE MIGRATION` only, and excluded from historical baseline state.

## G. Validation

- Documentation search confirms no active document classifies `users.phone` as confirmed or unresolved drift.
- `users_phone_key UNIQUE(phone)` and Prisma `phone @unique` are consistently classified as `MATCH` with `LOW` risk.
- `users.auth_id`, `users_auth_id_unique`, and `users_auth_fk` remain `CONFIRMED DRIFT`.
- The verified 19-table Production boundary remains unchanged.
- Production-only `parcel_packages` and `stock_history` remain preserved.
- RLS, policy, function, trigger, ownership, and cross-schema evidence was not changed.
- `CheckoutIdempotency` remains future-only and no executable baseline was created.
- Protected schema, migration, package, source, and environment paths were not changed.
- `git diff --check` passes.

No unrelated conflict was resolved by assumption. Remaining incomplete metadata continues to be reported as `PARTIAL`/`UNKNOWN` and blocks executable baseline generation.

## H. Final gate

```text
EVIDENCE CONFLICT RESOLVED: YES
USERS_PHONE_CLASSIFICATION: MATCH
AUTH_ID_DRIFT_PRESERVED: YES
CHECKOUTIDEMPOTENCY_FUTURE_ONLY: YES
PRODUCTION TOUCHED: NO
SCHEMA CHANGED: NO
MIGRATION CREATED: NO
READY FOR RECONCILIATION RETRY: YES
```

The gate authorizes only a repository-only reconciliation retry. It does not authorize Production access, SQL execution, migration activity, schema changes, or creation of an executable baseline.