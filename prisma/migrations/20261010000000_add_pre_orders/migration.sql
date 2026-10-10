-- AFA STORE — Pre-Order (PO) module.
-- Strictly ADDITIVE: three new tables + indexes + FKs only. No existing table,
-- column, constraint or row ("orders", "payments", "order_items", ...) is
-- altered or dropped. Review against the production schema before applying.

CREATE TABLE "pre_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "publicToken" TEXT,
    "customer" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "note" TEXT,
    "pickupDate" TIMESTAMP(3),
    "subtotal" INTEGER NOT NULL,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "source" TEXT NOT NULL DEFAULT 'ADMIN_MANUAL',
    "userId" TEXT,
    "createdById" TEXT,
    "handedOverById" TEXT,
    "handedOverAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pre_orders_poNumber_key" ON "pre_orders"("poNumber");
CREATE UNIQUE INDEX "pre_orders_publicToken_key" ON "pre_orders"("publicToken");
CREATE INDEX "pre_orders_phone_idx" ON "pre_orders"("phone");
CREATE INDEX "pre_orders_status_paymentStatus_idx" ON "pre_orders"("status", "paymentStatus");
CREATE INDEX "pre_orders_pickupDate_idx" ON "pre_orders"("pickupDate");
CREATE INDEX "pre_orders_createdAt_idx" ON "pre_orders"("createdAt");

CREATE TABLE "pre_order_items" (
    "id" TEXT NOT NULL,
    "preOrderId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "subtotal" INTEGER NOT NULL,

    CONSTRAINT "pre_order_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pre_order_items_preOrderId_idx" ON "pre_order_items"("preOrderId");

CREATE TABLE "pre_order_payments" (
    "id" TEXT NOT NULL,
    "preOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT,
    "operatorId" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cashReceived" INTEGER,
    "change" INTEGER,
    "transactionRef" TEXT,
    "transactionId" TEXT,
    "paymentType" TEXT,
    "qrisUrl" TEXT,
    "rawResponse" JSONB,
    "expiredAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pre_order_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pre_order_payments_idempotencyKey_key" ON "pre_order_payments"("idempotencyKey");
CREATE UNIQUE INDEX "pre_order_payments_transactionRef_key" ON "pre_order_payments"("transactionRef");
CREATE UNIQUE INDEX "pre_order_payments_preOrderId_sequence_key" ON "pre_order_payments"("preOrderId", "sequence");
CREATE INDEX "pre_order_payments_preOrderId_status_idx" ON "pre_order_payments"("preOrderId", "status");
CREATE INDEX "pre_order_payments_status_verifiedAt_idx" ON "pre_order_payments"("status", "verifiedAt");

ALTER TABLE "pre_order_items" ADD CONSTRAINT "pre_order_items_preOrderId_fkey"
    FOREIGN KEY ("preOrderId") REFERENCES "pre_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pre_order_payments" ADD CONSTRAINT "pre_order_payments_preOrderId_fkey"
    FOREIGN KEY ("preOrderId") REFERENCES "pre_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
