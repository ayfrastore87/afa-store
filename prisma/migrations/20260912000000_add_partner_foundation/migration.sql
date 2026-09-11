-- AFA STORE MITRA — Partner foundation (additive only).
-- DO NOT apply to production without explicit review & backup.
-- This migration only CREATES new tables, indexes and foreign keys.
-- It does NOT alter or drop any existing table/column/data.

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerCode" TEXT NOT NULL,
    "partnerType" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "displayName" TEXT NOT NULL,
    "businessName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "village" TEXT,
    "district" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_product_prices" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_stocks" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_stock_movements" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "productId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" INTEGER,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_sales" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "saleNumber" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subtotal" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "grossProfit" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_sale_items" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "costPriceSnapshot" INTEGER NOT NULL,
    "sellingPriceSnapshot" INTEGER NOT NULL,
    "subtotalCost" INTEGER NOT NULL,
    "subtotalRevenue" INTEGER NOT NULL,

    CONSTRAINT "partner_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_locations" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_visits" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "visitedBy" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "note" TEXT,
    "photoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "partners_userId_key" ON "partners"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "partners_partnerCode_key" ON "partners"("partnerCode");

-- CreateIndex
CREATE INDEX "partners_status_idx" ON "partners"("status");

-- CreateIndex
CREATE INDEX "partner_product_prices_partnerId_productId_effectiveFrom_idx" ON "partner_product_prices"("partnerId", "productId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "partner_product_prices_productId_idx" ON "partner_product_prices"("productId");

-- CreateIndex
CREATE INDEX "partner_stocks_productId_idx" ON "partner_stocks"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_stocks_partnerId_productId_key" ON "partner_stocks"("partnerId", "productId");

-- CreateIndex
CREATE INDEX "partner_stock_movements_partnerId_createdAt_idx" ON "partner_stock_movements"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_stock_movements_partnerId_productId_createdAt_idx" ON "partner_stock_movements"("partnerId", "productId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_stock_movements_referenceType_referenceId_idx" ON "partner_stock_movements"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "partner_sales_saleNumber_key" ON "partner_sales"("saleNumber");

-- CreateIndex
CREATE INDEX "partner_sales_partnerId_soldAt_idx" ON "partner_sales"("partnerId", "soldAt");

-- CreateIndex
CREATE INDEX "partner_sale_items_saleId_idx" ON "partner_sale_items"("saleId");

-- CreateIndex
CREATE INDEX "partner_locations_partnerId_recordedAt_idx" ON "partner_locations"("partnerId", "recordedAt");

-- CreateIndex
CREATE INDEX "partner_visits_partnerId_createdAt_idx" ON "partner_visits"("partnerId", "createdAt");

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_product_prices" ADD CONSTRAINT "partner_product_prices_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_product_prices" ADD CONSTRAINT "partner_product_prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_stocks" ADD CONSTRAINT "partner_stocks_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_stocks" ADD CONSTRAINT "partner_stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_stock_movements" ADD CONSTRAINT "partner_stock_movements_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_stock_movements" ADD CONSTRAINT "partner_stock_movements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_sales" ADD CONSTRAINT "partner_sales_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_sale_items" ADD CONSTRAINT "partner_sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "partner_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_sale_items" ADD CONSTRAINT "partner_sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_locations" ADD CONSTRAINT "partner_locations_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_visits" ADD CONSTRAINT "partner_visits_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_visits" ADD CONSTRAINT "partner_visits_visitedBy_fkey" FOREIGN KEY ("visitedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
