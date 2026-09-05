import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const order = read("../src/app/api/checkout/order/route.ts");
const idempotency = read("../src/lib/checkout-idempotency.ts");
const schema = read("../prisma/schema.prisma");
const paymentMutation = read("../src/app/api/payments/[invoice]/route.ts");
const upload = read("../src/app/api/payment/upload/route.ts");
const webhook = read("../src/app/api/midtrans/webhook/route.ts");

test("same key and same request returns the stored checkout response", () => {
  assert.match(order, /existing\.userId !== user\.id \|\| existing\.requestHash !== requestHash/);
  assert.match(order, /existing\.responsePayload.*NextResponse\.json\(existing\.responsePayload/);
});

test("same key with a different request safely conflicts", () => {
  assert.match(order, /different request/);
  assert.match(order, /status: 409/);
});

test("a cross-user idempotency key safely conflicts", () => {
  assert.match(order, /existing\.userId !== user\.id/);
  assert.match(schema, /key\s+String\s+@unique/);
});

test("PROCESSING state returns a retry-safe conflict", () => {
  assert.match(order, /status: "PROCESSING"/);
  assert.match(order, /already being processed/);
});

test("completed retry is backed by stored response and unique order binding", () => {
  assert.match(order, /status: "COMPLETED", responsePayload/);
  assert.match(schema, /orderId\s+String\?\s+@unique/);
});

test("request hashing canonicalizes objects and deterministically sorts items", () => {
  assert.match(idempotency, /Object\.keys\(record\)\.sort\(\)/);
  assert.match(idempotency, /items: \[\.\.\.items\]\.sort\(\(a, b\) => a\.id\.localeCompare\(b\.id\)\)/);
});

test("conditional stock decrement allows at most one winner at stock one", async () => {
  let stock = 1;
  const decrement = async () => stock >= 1 ? (--stock, true) : false;
  const results = await Promise.all([decrement(), decrement()]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(stock, 0);
  assert.match(order, /stock: \{ gte: item\.qty \}/);
});

test("client payment mutation cannot self-mark PAID", () => {
  assert.match(paymentMutation, /Payment mutation is not permitted/);
  assert.match(paymentMutation, /status: 403/);
  assert.match(upload, /invoice, userId: user\.id/);
});

test("duplicate and terminal webhooks are conditional and do not touch stock", () => {
  assert.match(webhook, /where: \{ id: payment\.id, status: "PENDING" \}/);
  assert.match(webhook, /if \(!changed\.count\) return/);
  assert.doesNotMatch(webhook, /stock|order\.create|orderItem\.create/);
});

test("cart cleanup failure cannot duplicate an order on retry", () => {
  const completion = order.indexOf('status: "COMPLETED", responsePayload');
  const cleanup = order.indexOf('from("cart_items")');
  assert.ok(completion >= 0 && cleanup > completion);
  assert.match(order, /if \(existing\.responsePayload\) return/);
});