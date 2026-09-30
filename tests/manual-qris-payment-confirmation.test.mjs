import test from "node:test";
import assert from "node:assert/strict";
import { paymentTransition } from "../src/lib/payment-transition.ts";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/app/api/admin/kasir/orders/[id]/confirm-qris-payment/route.ts", import.meta.url), "utf8");

test("manual QRIS confirmation uses the canonical paid transition", () => {
  assert.deepEqual(paymentTransition("PENDING", "PENDING", "settlement").orderStatus, "PROCESSING");
  assert.match(route, /paymentTransition\(/);
  assert.match(route, /status: transition\.orderStatus/);
  assert.match(route, /processedAt: wasPending \? now/);
});

test("manual confirmation is payment-only and cannot create or alter shipment data", () => {
  assert.match(route, /payment\.updateMany/);
  assert.match(route, /status: "PENDING"/);
  assert.doesNotMatch(route, /createBiteshipOrder|biteshipOrderId|courier|service|shipping|subtotal|total|product/);
});

test("repeated confirmation cannot transition payment twice", () => {
  assert.match(route, /where: \{ id: payment\.id, status: "PENDING" \}/);
  assert.match(route, /if \(!changed\.count\)/);
  assert.match(route, /alreadyPaid: true/);
});

test("manual QRIS remains admin-authorized and rejects invalid/provider-owned orders", () => {
  assert.match(route, /if \(!admin\)/);
  assert.match(route, /if \(!order \|\| !order\.payment\)/);
  assert.match(route, /Midtrans QRIS cannot be confirmed manually/);
});