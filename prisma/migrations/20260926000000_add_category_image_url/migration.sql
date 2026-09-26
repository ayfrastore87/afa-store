-- AFA STORE — category-owned images. Additive and backward-compatible.
-- Artifact only: review against the actual production schema before applying.
ALTER TABLE "categories" ADD COLUMN "imageUrl" TEXT;