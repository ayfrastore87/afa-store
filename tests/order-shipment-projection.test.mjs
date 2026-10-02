import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { orderStatusFromBiteship } from "../src/lib/orders.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("Biteship active delivery states project PROCESSING to SHIPPED", () => {
  for (const status of ["picking_up", "picked", "in_transit", "dropping_off", "pickingUp", "inTransit", "droppingOff"]) {
    assert.equal(orderStatusFromBiteship(status, "PROCESSING"), "SHIPPED", status);
  }
});

test("delivered projects SHIPPED to COMPLETED", () => {
  assert.equal(orderStatusFromBiteship("delivered", "SHIPPED"), "COMPLETED");
});

test("projection is monotonic and does not downgrade terminal or unknown states", () => {
  assert.equal(orderStatusFromBiteship("in_transit", "COMPLETED"), null);
  assert.equal(orderStatusFromBiteship("in_transit", "SHIPPED"), null);
  assert.equal(orderStatusFromBiteship("unknown_provider_state", "PROCESSING"), null);
  assert.equal(orderStatusFromBiteship("returned", "SHIPPED"), null);
  assert.equal(orderStatusFromBiteship("cancelled", "PROCESSING"), null);
});

test("handover route is admin-only, validates signatures and is idempotent", () => {
  const route = read("../src/app/api/admin/orders/[id]/handover/route.ts");
  assert.match(route, /getCurrentCashier/);
  assert.match(route, /MAX_FILE_SIZE = 1 \* 1024 \* 1024/);
  assert.match(route, /file\.size > MAX_FILE_SIZE/);
  assert.match(route, /await signature\(file\)/);
  assert.match(route, /b\[4\] === 13/);
  assert.match(route, /handoverPhotoUrl: null, handedOverAt: null/);
  assert.match(route, /idempotent: true/);
});

test("handover client processing is bounded and uses progressive JPEG compression", () => {
  const helper = read("../src/lib/client-image.ts");
  assert.match(helper, /HANDOVER_IMAGE_MAX_BYTES = 1 \* 1024 \* 1024/);
  assert.match(helper, /createImageBitmap/);
  assert.match(helper, /imageOrientation: "from-image"/);
  assert.match(helper, /const qualities = \[0\.9, 0\.82, 0\.74/);
  assert.match(helper, /blob\.size <= HANDOVER_IMAGE_MAX_BYTES/);
  assert.match(helper, /for \(let attempt = 0; attempt < 4/);
});

test("public response is whitelist-shaped and contains handover display data only", () => {
  const route = read("../src/app/api/orders/public/[publicToken]/route.ts");
  assert.match(route, /handoverPhotoUrl: order\.handoverPhotoUrl/);
  assert.doesNotMatch(route, /rawResponse|biteshipOrderId|destinationAreaId|userId/);
});

test("handover is explicitly described as courier handover, not customer receipt", () => {
  const page = read("../src/app/pesanan/[publicToken]/page.tsx");
  assert.match(page, /diserahkan kepada kurir oleh petugas AFA STORE/);
  assert.doesNotMatch(page, /diterima customer|diterima pelanggan/);
});