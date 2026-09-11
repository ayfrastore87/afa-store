-- AFA STORE MITRA — Tahap V-A (F-3): partner sale idempotency.
-- Additive only: adds a nullable unique idempotency key to partner_sales.
-- ARTIFACT ONLY — DO NOT apply to production (migration history is not baselined).

-- AlterTable
ALTER TABLE "partner_sales" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "partner_sales_idempotencyKey_key" ON "partner_sales"("idempotencyKey");
