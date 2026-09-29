-- AFA STORE — Guest Checkout Idempotency — ROLLBACK (documentation only)
--
-- Prisma does not use this file. It documents the exact, guarded revert
-- procedure to be executed manually by an authorised operator IF the
-- forward migration (20260929000000_guest_checkout_idempotency) must be
-- undone AFTER application code has already begun writing guest rows.
--
-- Preconditions before running any of this:
--   • Application deployment writing guest rows has been rolled back.
--   • GUEST_CHECKOUT_ENABLED is false.
--   • No new guest orders are being created.
--
-- The rollback is FAIL-CLOSED: it aborts if any guest row still exists,
-- because dropping the CHECK / column would silently discard live guest
-- checkout state and orphan guest CheckoutHistory / Order rows.

DO $$
DECLARE
    guest_row_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO guest_row_count
    FROM "CheckoutIdempotency"
    WHERE "guestSessionHash" IS NOT NULL;

    IF guest_row_count > 0 THEN
        RAISE EXCEPTION
            'CheckoutIdempotency rollback refused: % row(s) still reference a guest identity. Drain guest rows first.',
            guest_row_count;
    END IF;
END
$$;

-- Reverse of step 5: drop shape CHECK.
ALTER TABLE "CheckoutIdempotency"
    DROP CONSTRAINT IF EXISTS "CheckoutIdempotency_guestSessionHash_shape_chk";

-- Reverse of step 4: drop XOR CHECK.
ALTER TABLE "CheckoutIdempotency"
    DROP CONSTRAINT IF EXISTS "CheckoutIdempotency_identity_xor_chk";

-- Reverse of step 3: drop guest index.
DROP INDEX IF EXISTS "CheckoutIdempotency_guestSessionHash_idx";

-- Reverse of step 2: drop guest identity column.
ALTER TABLE "CheckoutIdempotency" DROP COLUMN IF EXISTS "guestSessionHash";

-- Reverse of step 1: re-tighten userId to NOT NULL.
-- Safe only because the guarded DO block above ensured every row has userId.
ALTER TABLE "CheckoutIdempotency" ALTER COLUMN "userId" SET NOT NULL;
