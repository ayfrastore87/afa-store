import test from "node:test";
import assert from "node:assert/strict";
import { paymentTransition } from "../src/lib/payment-transition.ts";

for (const event of ["settlement", "capture_accept"]) test(`PENDING + ${event} becomes PAID + PROCESSING`, () => {
  assert.deepEqual(paymentTransition("PENDING", "PENDING", event), { paymentStatus: "PAID", orderPaymentStatus: "PAID", orderStatus: "PROCESSING", mutationAllowed: true, duplicate: false, reconciliationRequired: false, action: "payment_paid" });
});
test("PENDING expiration and cancellation preserve fulfillment", () => {
  assert.equal(paymentTransition("PENDING", "PENDING", "expire").paymentStatus, "EXPIRED");
  assert.equal(paymentTransition("PENDING", "PENDING", "cancel").paymentStatus, "CANCELLED");
});
test("duplicate settlement is a no-op", () => assert.equal(paymentTransition("PAID", "PROCESSING", "settlement").duplicate, true));
for (const event of ["expire", "cancel"]) test(`PAID + ${event} cannot downgrade`, () => {
  const result = paymentTransition("PAID", "SHIPPED", event);
  assert.equal(result.paymentStatus, "PAID"); assert.equal(result.mutationAllowed, false); assert.equal(result.reconciliationRequired, true);
});
for (const status of ["EXPIRED", "CANCELLED"]) test(`${status} + paid event requires reconciliation`, () => {
  const result = paymentTransition(status, "CANCELLED", "settlement");
  assert.equal(result.mutationAllowed, false); assert.equal(result.reconciliationRequired, true);
});
for (const status of ["PACKED", "SHIPPED", "COMPLETED"]) test(`${status} is not downgraded by paid event`, () => assert.equal(paymentTransition("PENDING", status, "settlement").orderStatus, status));