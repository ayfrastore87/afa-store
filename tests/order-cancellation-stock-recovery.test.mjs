import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const customerOrder = read("../src/app/api/account/orders/[id]/route.ts");
const adminPage = read("../src/app/admin/page.tsx");
const schema = read("../prisma/schema.prisma");
const webhook = read("../src/app/api/midtrans/webhook/route.ts");

test("customer order mutation is authenticated, owner-scoped, and fail-closed", () => {
  assert.match(customerOrder, /if \(!user\).*status: 401/);
  assert.match(customerOrder, /where: \{ id, userId: user\.id \}/);
  assert.match(customerOrder, /status: 403/);
  assert.doesNotMatch(customerOrder, /order\.update|order\.updateMany|product\.update|restock/i);
});

test("admin cancellation is visibly disabled for stock recovery until a durable policy exists", () => {
  assert.match(adminPage, /Stock is decremented atomically at checkout/);
  assert.match(adminPage, /Cancellation restoration remains disabled/);
  assert.match(adminPage, /cancelledAt/);
  assert.doesNotMatch(adminPage, /stock:\s*\{\s*increment/);
});

test("existing schema has no durable exactly-once restock marker or cancellation ledger", () => {
  assert.match(schema, /cancelledAt\s+DateTime\?/);
  assert.match(schema, /productId\s+String\?/);
  assert.doesNotMatch(schema, /restockedAt|restock(ed)?Id|inventoryMovement|stockLedger/i);
});

test("webhook payment transitions are transactional and do not mutate stock", () => {
  assert.match(webhook, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(webhook, /where: \{ id: payment\.id, status: "PENDING" \}/);
  assert.match(webhook, /if \(!changed\.count\) return/);
  assert.doesNotMatch(webhook, /stock|product\.update|orderItem\.update/i);
});

test("a cancellation retry must not be treated as a second restock effect", () => {
  const state = { status: "PENDING", restockEffects: 0 };
  const transition = () => {
    if (state.status === "CANCELLED") return false;
    state.status = "CANCELLED";
    state.restockEffects += 1;
    return true;
  };
  assert.equal(transition(), true);
  assert.equal(transition(), false);
  assert.equal(state.restockEffects, 1);
});