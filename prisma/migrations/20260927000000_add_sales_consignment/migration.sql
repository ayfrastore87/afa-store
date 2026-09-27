-- AFA STORE — Sales & Titip Jual (consignment) module.
-- Strictly ADDITIVE: new tables + FKs only. No existing table, column or data
-- is altered or dropped. Artifact only: review against the actual production
-- schema before applying (see DATABASE / MIGRATION SAFETY notes).

CREATE TABLE "sales_people" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_people_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_people_userId_key" ON "sales_people"("userId");

CREATE TABLE "consignment_stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "mapsUrl" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedSalesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consignment_stores_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consignment_stores_assignedSalesId_isActive_idx" ON "consignment_stores"("assignedSalesId", "isActive");

CREATE TABLE "consignment_stocks" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantitySupplied" INTEGER NOT NULL DEFAULT 0,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "quantityDamaged" INTEGER NOT NULL DEFAULT 0,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" INTEGER NOT NULL,
    "suppliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consignment_stocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "consignment_stocks_storeId_productId_key" ON "consignment_stocks"("storeId", "productId");
CREATE INDEX "consignment_stocks_productId_idx" ON "consignment_stocks"("productId");

CREATE TABLE "sales_visits" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "salesId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "notes" TEXT,
    "photoUrl" TEXT,
    "totalSold" INTEGER NOT NULL DEFAULT 0,
    "totalSupplied" INTEGER NOT NULL DEFAULT 0,
    "salesAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_visits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sales_visits_idempotencyKey_key" ON "sales_visits"("idempotencyKey");
CREATE INDEX "sales_visits_storeId_visitedAt_idx" ON "sales_visits"("storeId", "visitedAt");
CREATE INDEX "sales_visits_salesId_visitedAt_idx" ON "sales_visits"("salesId", "visitedAt");

CREATE TABLE "sales_visit_items" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "openingStock" INTEGER NOT NULL,
    "quantitySupplied" INTEGER NOT NULL DEFAULT 0,
    "quantitySold" INTEGER NOT NULL DEFAULT 0,
    "quantityReturned" INTEGER NOT NULL DEFAULT 0,
    "quantityDamaged" INTEGER NOT NULL DEFAULT 0,
    "closingStock" INTEGER NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "salesAmount" INTEGER NOT NULL,

    CONSTRAINT "sales_visit_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sales_visit_items_visitId_idx" ON "sales_visit_items"("visitId");

CREATE TABLE "store_payments" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "salesId" TEXT NOT NULL,
    "visitId" TEXT,
    "amount" INTEGER NOT NULL,
    "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "store_payments_storeId_paymentDate_idx" ON "store_payments"("storeId", "paymentDate");
CREATE INDEX "store_payments_salesId_paymentDate_idx" ON "store_payments"("salesId", "paymentDate");

ALTER TABLE "sales_people" ADD CONSTRAINT "sales_people_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consignment_stores" ADD CONSTRAINT "consignment_stores_assignedSalesId_fkey" FOREIGN KEY ("assignedSalesId") REFERENCES "sales_people"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consignment_stocks" ADD CONSTRAINT "consignment_stocks_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "consignment_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consignment_stocks" ADD CONSTRAINT "consignment_stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_visits" ADD CONSTRAINT "sales_visits_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "consignment_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_visits" ADD CONSTRAINT "sales_visits_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES "sales_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_visit_items" ADD CONSTRAINT "sales_visit_items_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "sales_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_visit_items" ADD CONSTRAINT "sales_visit_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "store_payments" ADD CONSTRAINT "store_payments_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "consignment_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_payments" ADD CONSTRAINT "store_payments_salesId_fkey" FOREIGN KEY ("salesId") REFERENCES "sales_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_payments" ADD CONSTRAINT "store_payments_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "sales_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;