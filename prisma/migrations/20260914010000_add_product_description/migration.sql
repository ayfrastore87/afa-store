-- AFA STORE — Product description (additive only).
-- Adds an optional product description shown on the public product detail page.
-- ARTIFACT ONLY — DO NOT apply to production without explicit review & backup.
-- Existing products keep valid (description is NULL and does not affect
-- homepage, cart, buy-now, checkout or admin edit flows).

ALTER TABLE "products" ADD COLUMN "description" TEXT;
