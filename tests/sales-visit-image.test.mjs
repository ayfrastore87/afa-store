import test from "node:test";
import assert from "node:assert/strict";
import { hasSupportedImageSignature, nextImageAttempt, SALES_VISIT_MAX_BYTES } from "../src/lib/sales-visit-image.ts";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("sales visit image signatures accept JPEG PNG and WebP", () => {
  assert.equal(hasSupportedImageSignature(Uint8Array.from([0xff, 0xd8, 0xff])), true);
  assert.equal(hasSupportedImageSignature(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(hasSupportedImageSignature(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), true);
  assert.equal(hasSupportedImageSignature(Uint8Array.from([0x89, 0x50, 0x4e])), false);
});

test("compression attempts are bounded and reduce quality then dimensions", () => {
  let attempt = nextImageAttempt(1600, 1200, 0.85, 0);
  assert.equal(attempt.quality, 0.75);
  for (let i = 1; i < 10; i++) attempt = nextImageAttempt(attempt.width, attempt.height, attempt.quality, i);
  assert.equal(nextImageAttempt(attempt.width, attempt.height, attempt.quality, 10), null);
  assert.equal(SALES_VISIT_MAX_BYTES, 1024 * 1024);
});

test("visit financial metadata is server-validated and persisted without overloading visit notes", () => {
  const route = read("../src/app/api/sales/visits/route.ts");
  assert.match(route, /reference: z\.string\(\)\.trim\(\)\.max\(150\)/);
  assert.match(route, /notes: z\.string\(\)\.trim\(\)\.max\(500\)/);
  assert.match(route, /reference: payment\.reference \|\| null/);
  assert.match(route, /notes: payment\.notes \|\| null/);
  assert.match(route, /notes: notes \|\| null/);
});

test("sales visit detail and photo deletion are ownership scoped", () => {
  const detail = read("../src/app/api/sales/visits/[id]/route.ts");
  const photo = read("../src/app/api/sales/visits/photo/route.ts");
  assert.match(detail, /where: \{ id, salesId: current\.sales\.id \}/);
  assert.match(photo, /getCurrentSalesPerson\(\)/);
  assert.match(photo, /sales-visits\/\$\{current\.sales\.id/);
  assert.match(photo, /completed/);
});

test("admin visit detail has an independent admin guard", () => {
  const route = read("../src/app/api/admin/consignment/visits/[id]/route.ts");
  const page = read("../src/app/admin/(protected)/titip-jual/kunjungan/[id]/page.tsx");
  assert.match(route, /getCurrentAdmin\(\)/);
  assert.match(route, /status:403/);
  assert.match(page, /requireAdmin\(\)/);
});