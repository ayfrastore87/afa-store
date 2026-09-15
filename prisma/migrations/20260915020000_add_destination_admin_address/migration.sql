-- AFA STORE — destination administrative address snapshot (additive only).
--
-- Adds:
--   orders.destinationProvince    : snapshot of destination province (metadata).
--   orders.destinationCity        : snapshot of destination city / regency.
--   orders.destinationDistrict    : snapshot of destination district (kecamatan).
--   orders.destinationVillage     : snapshot of destination village (kelurahan/desa).
--   orders.destinationPostalCode  : snapshot of destination postal code.
--
-- These are DELIVERY ADDRESS METADATA ONLY. They are NEVER used to compute
-- shipping price, and NEVER substitute the authoritative Biteship
-- destinationAreaId (which remains the source of truth for shipping rates).
--
-- ARTIFACT ONLY — DO NOT apply to production without explicit review & backup.

ALTER TABLE "orders" ADD COLUMN "destinationProvince" TEXT;
ALTER TABLE "orders" ADD COLUMN "destinationCity" TEXT;
ALTER TABLE "orders" ADD COLUMN "destinationDistrict" TEXT;
ALTER TABLE "orders" ADD COLUMN "destinationVillage" TEXT;
ALTER TABLE "orders" ADD COLUMN "destinationPostalCode" TEXT;
