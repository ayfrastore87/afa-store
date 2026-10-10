import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync(new URL("../src/app/api/admin/sales/export/route.ts", import.meta.url), "utf8");
const report = fs.readFileSync(new URL("../src/app/api/admin/sales/report/route.ts", import.meta.url), "utf8");

test("sales export is admin guarded and bounded", () => {
  assert.match(route, /getCurrentAdmin\(\)/);
  assert.match(route, /MAX_EXPORT_ROWS = 5000/);
  assert.match(route, /status: 413/);
});

test("sales export validates period and uses an exclusive selected-period range", () => {
  assert.match(route, /REPORT_PERIODS/);
  assert.match(route, /periodRange\(period, params\.get\("month"\)\)/);
  assert.match(route, /createdAt: \{ gte: from/);
  assert.match(route, /lt: to/);
});

test("sales export is independent of UI pagination and excludes phone data", () => {
  assert.doesNotMatch(route, /skip:/);
  assert.doesNotMatch(route, /phone: true/);
  assert.match(route, /take: MAX_EXPORT_ROWS/);
});

test("report exposes the complete daily revenue dataset", () => {
  assert.match(report, /dailyRevenue: revenueResult\.daily/);
});