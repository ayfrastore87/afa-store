-- Additive fields for POS/Kasir (AFA STORE).
-- Sumber transaksi (ONLINE default) + detail pembayaran tunai.
-- Database columns were already applied manually in Supabase.

ALTER TABLE "orders" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "orders" ADD COLUMN "cashReceived" INTEGER;
ALTER TABLE "orders" ADD COLUMN "change" INTEGER;
