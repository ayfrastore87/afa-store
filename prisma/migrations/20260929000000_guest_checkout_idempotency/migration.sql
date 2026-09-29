-- AFA STORE — Guest Checkout Idempotency (additive artifact only)
--
-- Baseline verified before this migration was drafted:
--   TABLE  CheckoutIdempotency exists
--   MIG    20260905000000_add_checkout_idempotency FINISHED
--   userId NOT NULL, no guestSessionHash column, no CHECK constraints,
--   14 rows all authenticated + COMPLETED, userId NOT NULL for every row.
--
-- This migration is PURE ADDITIVE + PURE WIDENING:
--   • ALTER userId DROP NOT NULL      (widening — never rejects existing rows)
--   • ADD guestSessionHash TEXT NULL  (additive — every existing row satisfies NULL)
--   • ADD guest-only index
--   • ADD identity XOR CHECK
--   • ADD guestSessionHash shape CHECK
--
-- All 14 existing rows have (userId NOT NULL, guestSessionHash NULL after ADD),
-- which satisfies the XOR CHECK. No data cleanup is required.
--
-- Existing schema is NOT touched:
--   • CheckoutIdempotency_key_key                (UNIQUE key)     — preserved
--   • CheckoutIdempotency_orderId_key            (UNIQUE orderId) — preserved
--   • CheckoutIdempotency_userId_idx             (index userId)   — preserved
--   • CheckoutIdempotency_status_expiresAt_idx   (composite idx)  — preserved
--   • CheckoutIdempotency_userId_fkey            (FK → users)     — preserved
--   • CheckoutIdempotency_orderId_fkey           (FK → orders)    — preserved
--
-- DO NOT run against production without operator approval per FASE-2.5x gates.

-- 1) Widening: allow guest checkout by making userId optional.
ALTER TABLE "CheckoutIdempotency" ALTER COLUMN "userId" DROP NOT NULL;

-- 2) Additive: guest identity column (SHA-256 hex of the raw guest cookie token).
--    Raw tokens NEVER touch the database — only their sha256(raw).hex is stored.
ALTER TABLE "CheckoutIdempotency" ADD COLUMN "guestSessionHash" TEXT;

-- 3) Additive index for guest-identity lookups (mirrors existing userId_idx role).
CREATE INDEX "CheckoutIdempotency_guestSessionHash_idx"
    ON "CheckoutIdempotency"("guestSessionHash");

-- 4) Identity XOR: exactly one of userId or guestSessionHash must be present.
--    All existing rows are (userId NOT NULL, guestSessionHash NULL) after step 2,
--    so this CHECK accepts every existing row without modification.
ALTER TABLE "CheckoutIdempotency"
    ADD CONSTRAINT "CheckoutIdempotency_identity_xor_chk"
    CHECK (
        ("userId" IS NOT NULL AND "guestSessionHash" IS NULL)
        OR
        ("userId" IS NULL AND "guestSessionHash" IS NOT NULL)
    );

-- 5) Shape guard: guestSessionHash must be exactly 64 lowercase hex characters
--    (SHA-256 hex digest length). NULL is permitted (authenticated rows).
ALTER TABLE "CheckoutIdempotency"
    ADD CONSTRAINT "CheckoutIdempotency_guestSessionHash_shape_chk"
    CHECK (
        "guestSessionHash" IS NULL
        OR "guestSessionHash" ~ '^[0-9a-f]{64}$'
    );
