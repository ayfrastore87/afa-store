-- AFA STORE — destination delivery-location coordinates (additive only).
--
-- Adds:
--   orders.destinationLatitude  : optional delivery-point latitude (metadata only).
--   orders.destinationLongitude : optional delivery-point longitude (metadata only).
--
-- These coordinates are DELIVERY LOCATION METADATA ONLY. They are NEVER used to
-- compute shipping price, and NEVER substitute the authoritative Biteship
-- destinationAreaId (which remains the source of truth for shipping rates).
--
-- ARTIFACT ONLY — DO NOT apply to production without explicit review & backup.

ALTER TABLE "orders" ADD COLUMN "destinationLatitude" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN "destinationLongitude" DOUBLE PRECISION;