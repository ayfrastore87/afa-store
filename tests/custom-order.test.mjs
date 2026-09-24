import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const helper = read("../src/lib/custom-order.ts");
const route = read("../src/app/api/admin/kasir/order/route.ts");
const publicApi = read("../src/app/api/orders/public/[publicToken]/route.ts");
test("custom order foundation validates manual types and integer money", () => {
  assert.match(helper, /CUSTOM_PRODUCT.*SERVICE/);
  assert.match(helper, /Number\.isInteger\(quantity\)/);
  assert.match(helper, /Number\.isInteger\(unitPrice\)/);
  assert.match(helper, /calculateOrderTotals/);
});
test("server route authorizes products and persists manual snapshots", () => {
  assert.match(route, /authorizeProductItems/);
  assert.match(route, /productId: null/);
  assert.match(route, /itemType: item\.itemType/);
  assert.match(route, /randomBytes\(24\)/);
  assert.match(route, /prisma\.\$transaction/);
});
test("public endpoint uses exact token and whitelist without internal id or notes", () => {
  assert.match(publicApi, /where: \{ publicToken \}/);
  assert.match(publicApi, /select:/);
  assert.doesNotMatch(publicApi, /id: true/);
  assert.doesNotMatch(publicApi, /notes: true/);
  assert.match(publicApi, /status: 404/);
});
test("service-only orders do not require shipping in the existing pickup path", () => {
  assert.match(route, /orderType.*DEFAULT_KASIR_ORDER_TYPE/);
  assert.match(route, /orderType === "DELIVERY"/);
});
test("KasirPOS custom payload accepts null productId and skips empty catalog authorization", () => {
  const kasir = read("../src/components/admin/kasir/KasirPOS.tsx");
  assert.match(kasir, /itemType: line\.itemType, name: line\.name, description: line\.description, notes: line\.notes, quantity: line\.quantity, unitPrice: line\.price/);
  assert.match(route, /productRequests\.length/);
  assert.match(route, /productId: null/);
  assert.match(route, /item\.unitPrice \* item\.quantity/);
  assert.match(route, /kasir_manual_item_validation_failed/);
});
test("sales report adds source breakdown without a second revenue aggregate", () => {
  const report = read("../src/app/api/admin/sales/report/route.ts");
  assert.match(report, /groupBy\(\{ by: \["source"\]/);
  assert.match(report, /grandTotal: revenue/);
});