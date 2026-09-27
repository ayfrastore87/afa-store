-- AFA STORE — additive SalesVisit GPS metadata.
-- REVIEW ONLY: do not apply to Production until the schema/catalog is verified.
-- No existing table, column, data, or unrelated module is altered or dropped.

ALTER TABLE "sales_visits"
    ADD COLUMN "locationAccuracy" DOUBLE PRECISION,
    ADD COLUMN "locationCapturedAt" TIMESTAMP(3);