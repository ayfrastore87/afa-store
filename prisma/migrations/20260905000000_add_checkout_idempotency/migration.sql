-- Additive artifact only. Do not apply to production without explicit approval.
CREATE TABLE "CheckoutIdempotency" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responsePayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "CheckoutIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CheckoutIdempotency_key_key" ON "CheckoutIdempotency"("key");
CREATE UNIQUE INDEX "CheckoutIdempotency_orderId_key" ON "CheckoutIdempotency"("orderId");
CREATE INDEX "CheckoutIdempotency_userId_idx" ON "CheckoutIdempotency"("userId");
CREATE INDEX "CheckoutIdempotency_status_expiresAt_idx" ON "CheckoutIdempotency"("status", "expiresAt");

ALTER TABLE "CheckoutIdempotency" ADD CONSTRAINT "CheckoutIdempotency_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheckoutIdempotency" ADD CONSTRAINT "CheckoutIdempotency_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;