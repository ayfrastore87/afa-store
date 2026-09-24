ALTER TABLE "orders" ADD COLUMN "publicToken" TEXT;
ALTER TABLE "order_items" ADD COLUMN "description" TEXT;
ALTER TABLE "order_items" ADD COLUMN "notes" TEXT;
ALTER TABLE "order_items" ADD COLUMN "itemType" TEXT NOT NULL DEFAULT 'PRODUCT';
ALTER TABLE "order_items" ADD COLUMN "unitPrice" INTEGER;
CREATE UNIQUE INDEX "orders_publicToken_key" ON "orders"("publicToken");