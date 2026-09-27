import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const register = read("../src/app/api/sales/stores/register/route.ts");
const photo = read("../src/app/api/sales/stores/photo/route.ts");
const salesUi = read("../src/components/sales/SalesStoreRegistration.tsx");
const flow = read("../src/components/sales/SalesVisitFlow.tsx");
const adminUi = read("../src/components/admin/consignment/ConsignmentAdminPanel.tsx");
const locationControl = read("../src/components/maps/LocationCaptureControl.tsx");
const visitMap = read("../src/components/maps/VisitLocationMap.tsx");
const image = read("../src/lib/sales-visit-image.ts");
const prisma = read("../src/lib/prisma.ts");
const adminStoreApi = read("../src/app/api/admin/consignment/stores/route.ts");
const migration = read("../prisma/migrations/20260927020000_add_consignment_store_photo/migration.sql");

test("Sales registration authenticates and assigns from the session only", () => {
  assert.match(register, /getCurrentSalesPerson\(\)/);
  assert.match(register, /if \(!current\).*403/);
  assert.match(register, /assignedSalesId: current\.sales\.id/);
  assert.doesNotMatch(register, /assignedSalesId: data\./);
  assert.match(register, /where: \{ assignedSalesId: current\.sales\.id \}/);
  assert.match(read("../src/app/api/sales/stores/[id]/route.ts"), /assignedSalesId: current\.sales\.id/);
});

test("registration validates GPS and isolates store creation from visit accounting", () => {
  assert.match(register, /latitude: z\.number\(\)\.min\(-90\)\.max\(90\)/);
  assert.match(register, /longitude: z\.number\(\)\.min\(-180\)\.max\(180\)/);
  assert.match(register, /\.strict\(\)/);
  assert.match(register, /prisma\.consignmentStore\.create/);
  assert.doesNotMatch(register, /salesVisit\.create|salesVisitItem\.create|storePayment\.create|consignmentStock\.create|product\.update|receivable/i);
  assert.match(register, /assignedSalesId: current\.sales\.id/);
  assert.match(register, /const mapsUrl = `https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=\$\{data\.latitude\},\$\{data\.longitude\}`/);
});

test("Sales GPS UI uses high accuracy, supports retry, and has no editable coordinates", () => {
  assert.match(salesUi, /enableHighAccuracy: true/);
  assert.match(salesUi, /maximumAge: 0/);
  assert.match(salesUi, /timeout: 15000/);
  assert.match(salesUi, /PERBARUI LOKASI SAYA/);
  assert.doesNotMatch(salesUi, /name=["']latitude|name=["']longitude/);
  assert.doesNotMatch(salesUi, /photoUrl:/);
});

test("Admin uses shared GPS/map control while retaining assignment API", () => {
  assert.match(adminUi, /LocationCaptureControl/);
  assert.doesNotMatch(adminUi, /form\.latitude|form\.longitude/);
  assert.match(locationControl, /enableHighAccuracy: true/);
  assert.match(locationControl, /maximumAge: 0/);
  assert.match(locationControl, /timeout: 15000/);
  assert.match(adminStoreApi, /assignedSalesId/);
  assert.match(adminStoreApi, /salesPerson\.findFirst/);
  assert.match(adminUi, /assignedSalesId/);
});

test("shared Google Maps singleton and VisitLocationMap remain the map path", () => {
  assert.match(visitMap, /getGoogleMapsApi/);
  assert.match(visitMap, /loadGoogleMaps/);
  assert.match(visitMap, /google\.com\/maps\/search/);
  assert.doesNotMatch(salesUi, /maps\.googleapis\.com|new Google Maps|<script/);
  assert.doesNotMatch(locationControl, /maps\.googleapis\.com|<script/);
});

test("photo pipeline enforces optimized size, signatures, and accepted formats", () => {
  assert.match(image, /SALES_VISIT_MAX_BYTES = 1024 \* 1024/);
  assert.match(image, /blob\.size <= SALES_VISIT_MAX_BYTES/);
  assert.match(image, /hasSupportedImageSignature/);
  assert.match(photo, /file\.size > SALES_VISIT_MAX_BYTES/);
  assert.match(photo, /image\/jpeg.*image\/png.*image\/webp/);
  assert.match(photo, /hasSupportedImageSignature/);
  assert.doesNotMatch(photo, /image\/svg|image\/svg\+xml/);
  assert.match(salesUi, /accept="image\/\*"/);
  assert.match(salesUi, /capture="environment"/);
});

test("photo ownership uses a server-created Sales namespace and never trusts public URL", () => {
  assert.match(photo, /sales-visits\/stores\/\$\{current\.sales\.id\}\/\$\{crypto\.randomUUID\(\)\}\.webp/);
  assert.match(register, /photoPathPattern/);
  assert.match(register, /current\.sales\.id\.replace/);
  assert.match(register, /photoUrl = data\.photoPath .*getPublicUrl\(data\.photoPath\)/);
  assert.doesNotMatch(register, /photoUrl: data\.photoUrl/);
  assert.doesNotMatch(register, /z\.string\(\)\.url\(\).*photoUrl/);
  assert.match(register, /photoUrl,/);
  assert.doesNotMatch(register, /SalesVisit.*photoUrl/);
});

test("registration photo cleanup is authenticated, scoped, and orphan-safe", () => {
  assert.match(photo, /export async function DELETE/);
  assert.match(photo, /getCurrentSalesPerson\(\)/);
  assert.match(photo, /sales-visits\/stores\/\$\{escapedSalesId\}/);
  assert.match(photo, /remove\(\[path\]\)/);
  assert.match(register, /sales_store_photo_orphan_cleanup_failed/);
  assert.match(register, /if \(data\.photoPath\)/);
  assert.match(read("../src/app/api/sales/visits/photo/route.ts"), /completed/);
});

test("successful creation refreshes assigned stores and selects returned server data", () => {
  assert.match(flow, /fetch\("\/api\/sales\/stores"/);
  assert.match(flow, /const refreshed = .*\.stores/);
  assert.match(flow, /refreshed\.find\(.*store\.id/);
  assert.match(flow, /selectStore\(created\.id, created\.name\)/);
  assert.doesNotMatch(flow, /fetch\("\/api\/sales\/stores\/register".*\.then/);
});

test("duplicate detection is normalized and does not expose internal assignment", () => {
  assert.match(register, /toLocaleLowerCase\(\)\.replace\(\/\\s\+\/g, " "\)\.trim\(\)/);
  assert.match(register, /replace\(\/\\D\/g, ""\)/);
  assert.match(register, /status: 409/);
  assert.match(register, /Toko dengan nama\/nomor yang sama mungkin sudah terdaftar/);
  assert.doesNotMatch(register, /assignedSalesId.*message|candidate\.assignedSales/);
});

test("Prisma remains singleton with a one-connection adapter and migration is unchanged", () => {
  assert.match(prisma, /globalForPrisma\.prisma \?\? new PrismaClient/);
  assert.match(prisma, /max: 1/);
  assert.doesNotMatch(prisma, /new PrismaClient[\s\S]*new PrismaClient/);
  assert.doesNotMatch(prisma, /\$disconnect\s*\(/);
  assert.equal(migration.trim().replace(/\r\n/g, "\n"), 'ALTER TABLE "consignment_stores"\nADD COLUMN "photoUrl" TEXT;');
});