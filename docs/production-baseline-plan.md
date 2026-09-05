# AFA STORE — Production Baseline Plan

**Recommendation:** OPTION D — HYBRID. **DESIGN ONLY; DO NOT IMPLEMENT YET.**

**FASE 2.36 review (2026-09-06):** strategy retained without implementation. Exact approved Production metadata is still unavailable, so no baseline artifact can yet be finalized or approved.

## Comparison

| Approach | Assessment |
|---|---|
| A. Existing schema baseline | Correct foundation only after exact Production evidence; guessing would institutionalize drift. |
| B. Prisma baseline artifact | Useful reviewed representation of evidenced public objects, but it must be marked applied rather than executed over non-empty Production. |
| C. External auth strategy | Required: `auth.users` remains Supabase-owned and outside application DDL/history. |
| D. Future Prisma chain | Begins only after the accepted baseline; subsequent public business changes are ordered, deterministic Prisma migrations. |

## Current state and P3005

The supplied Production baseline reports a non-empty public schema with no `_prisma_migrations`. `prisma migrate deploy` therefore cannot establish that existing objects correspond to a known migration history. Prisma reports P3005 for a non-empty schema that has not been baselined, rather than safely replaying creation DDL over existing tables.

## Baseline objective and history

1. Capture exact, approved read-only Production metadata.
2. Resolve every public-object difference and explicitly assign ownership.
3. Produce one reviewed baseline artifact representing only already-existing, application-owned public objects at the chosen cut-off.
4. Record that baseline as applied through the separately approved Prisma baselining procedure; do not execute its historical creation SQL over existing Production objects.
5. Keep Supabase-managed schemas, especially `auth`, out of the application-owned artifact.
6. Append `20260905000000_add_checkout_idempotency` only after baseline history is established and all gates pass.
7. Create all future public business changes as new Prisma migrations from that accepted state. Do not rewrite accepted history.

The exact baseline artifact and exact operational commands are deliberately deferred until evidence, tooling/version behavior, target identity, and approvals are confirmed.

## Ownership boundary and exclusions

- Existing application-owned `public` business objects may be represented only after exact Production metadata evidence and object-by-object review.
- `auth.users` and the `auth` schema are Supabase-managed/external. The baseline must not create, alter, drop, or claim ownership of them.
- `public.users.auth_id -> auth.users.id` is a required cross-schema relationship to verify; it is currently `UNKNOWN`, not assumed.
- `stock_history` existence, definition, and ownership remain `UNKNOWN` pending approved Production evidence.
- A baseline must represent historical state only and must never execute creation SQL over existing Production tables.
- `CheckoutIdempotency` remains a separate future additive migration, **NOT EXECUTED**, after baseline and operational gates are independently approved.

## Verification

- Before: compare normalized metadata to the baseline artifact; confirm no unexpected objects and independently verify artifact hashes.
- During: confirm the selected migration name and target, one execution, expected transaction outcome, and classified logs.
- After: metadata-only verification of migration history, table, columns, indexes and FKs; application health checks without creating a Production order/payment.
- Preserve evidence and require two-person review for target identity and migration order.

## Rollback and recovery

Prisma rollback is not automatic. Prefer a reviewed forward fix. If application rollout fails, route traffic to a schema-compatible prior release and retain additive objects. Do not automatically drop `CheckoutIdempotency`. A catastrophic schema failure requires stopping rollout and using the approved Supabase restore/PITR process with its named owner and recovery point. Never blindly retry or manually mark an uncertain migration successful.

**Gate:** baseline implementation remains blocked by missing exact Production evidence and approval.