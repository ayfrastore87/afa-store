-- AFA STORE — Dropshipper identity fields (additive only).
--
-- ADDITIVE ONLY — do NOT apply automatically to production without explicit
-- review & backup. The columns store the dropshipper *sender identity* only:
-- the physical Biteship origin remains server-controlled (BITESHIP_ORIGIN_AREA_ID).
--
-- Adds:
--   orders.senderName  : dropshipper sender (pengirim) name label on the parcel.
--   orders.senderPhone : dropshipper sender phone (optional).
--   orders.hidePrice   : whether to omit price/invoice from the parcel (default false).

ALTER TABLE "orders" ADD COLUMN "senderName" TEXT;
ALTER TABLE "orders" ADD COLUMN "senderPhone" TEXT;
ALTER TABLE "orders" ADD COLUMN "hidePrice" BOOLEAN NOT NULL DEFAULT false;