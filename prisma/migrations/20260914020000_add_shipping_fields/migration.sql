-- AFA STORE — Phase 1 Biteship shipping rates (additive only).
--
-- Adds:
--   products.weight          : numeric product weight in GRAMS (safe default 1000 g).
--   orders.service           : chosen courier service name (e.g. "reg").
--   orders.serviceCode       : chosen courier service code.
--   orders.shippingQuoteRef  : Biteship quote reference (courier|service).
--   orders.destinationAreaId : Biteship destination area ID for later AWB booking.
--   orders.originAreaId      : Biteship origin area ID used at checkout (server-controlled).
--   order_items.weight       : frozen product weight snapshot at order time (grams).

-- ARTIFACT ONLY — DO NOT apply to production without explicit review & backup.
-- Existing products receive the 1000 g default (1 kg), which is a safe food-parcel
-- backfill; update per-product weights later via the Admin product editor.

ALTER TABLE "products" ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE "orders" ADD COLUMN "service" TEXT;
ALTER TABLE "orders" ADD COLUMN "serviceCode" TEXT;
ALTER TABLE "orders" ADD COLUMN "shippingQuoteRef" TEXT;
ALTER TABLE "orders" ADD COLUMN "destinationAreaId" TEXT;
ALTER TABLE "orders" ADD COLUMN "originAreaId" TEXT;

ALTER TABLE "order_items" ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 0;
