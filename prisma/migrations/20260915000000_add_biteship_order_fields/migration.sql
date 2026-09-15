-- AFA STORE — Phase 2 Biteship order creation (additive only).
--
-- Adds:
--   orders.courierCode        : Biteship courier CODE (e.g. "jne") frozen from the
--                              server-side revalidated quote at checkout. MUST NOT be
--                              guessed/mapped from the display name.
--   orders.biteshipOrderId    : Biteship order id (idempotent, unique).
--   orders.biteshipStatus     : last-known Biteship order status.
--   orders.biteshipTrackingId : Biteship tracking_id (waybill/tracking).
--   orders.biteshipLabelUrl   : Biteship courier label link.
--   orders.biteshipCreatedAt  : when the Biteship order was created server-side.
--
-- ARTIFACT ONLY — DO NOT apply to production without explicit review & backup.

ALTER TABLE "orders" ADD COLUMN "courierCode" TEXT;
ALTER TABLE "orders" ADD COLUMN "biteshipOrderId" TEXT;
ALTER TABLE "orders" ADD COLUMN "biteshipStatus" TEXT;
ALTER TABLE "orders" ADD COLUMN "biteshipTrackingId" TEXT;
ALTER TABLE "orders" ADD COLUMN "biteshipLabelUrl" TEXT;
ALTER TABLE "orders" ADD COLUMN "biteshipCreatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "orders_biteshipOrderId_key" ON "orders" ("biteshipOrderId");
