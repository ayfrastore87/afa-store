-- AFA MITRA — Fase 1 foundation: standalone Mitra account.
-- Additive only + one nullable alteration. Does NOT drop, delete, backfill,
-- or mutate existing rows. Existing Partner data is preserved unchanged.
-- ARTIFACT ONLY — DO NOT apply to production without explicit review & backup.

-- AlterTable: allow standalone partner (userId = NULL) while keeping the
-- existing unique constraint (PostgreSQL permits multiple NULLs).
ALTER TABLE "partners" ALTER COLUMN "userId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "mitra_accounts" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mitra_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mitra_accounts_partnerId_key" ON "mitra_accounts"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "mitra_accounts_username_key" ON "mitra_accounts"("username");

-- CreateIndex
CREATE UNIQUE INDEX "mitra_accounts_email_key" ON "mitra_accounts"("email");

-- AddForeignKey
ALTER TABLE "mitra_accounts" ADD CONSTRAINT "mitra_accounts_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
