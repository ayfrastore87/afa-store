import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schemaSource = fs.readFileSync(new URL("../src/lib/partner-location.ts", import.meta.url), "utf8");
const partnerRouteSource = fs.readFileSync(new URL("../src/app/api/partner/location/route.ts", import.meta.url), "utf8");
const adminRouteSource = fs.readFileSync(new URL("../src/app/api/admin/partners/[id]/location/route.ts", import.meta.url), "utf8");
const locationTabSource = fs.readFileSync(new URL("../src/components/partner/location-tab.tsx", import.meta.url), "utf8");

test("latitude is range-validated on the server", () => {
    assert.match(schemaSource, /latitude/);
    assert.match(schemaSource, /LATITUDE_MIN/);
    assert.match(schemaSource, /LATITUDE_MAX/);
    assert.match(schemaSource, /Number\.isFinite/);
});

test("longitude is range-validated on the server", () => {
    assert.match(schemaSource, /longitude/);
    assert.match(schemaSource, /LONGITUDE_MIN/);
    assert.match(schemaSource, /LONGITUDE_MAX/);
});

test("accuracy must be finite and non-negative", () => {
    assert.match(schemaSource, /accuracy/);
    assert.match(schemaSource, /n >= 0/);
});

test("consent must be explicitly true", () => {
    assert.match(schemaSource, /consent/);
    assert.match(schemaSource, /v === true/);
});

test("partner location route derives partnerId from session only", () => {
    assert.match(partnerRouteSource, /getCurrentPartner\(\)/);
    assert.match(partnerRouteSource, /current\.partner\.id/);
    assert.doesNotMatch(partnerRouteSource, /body\.partnerId|partnerId\s*=\s*request/);
});

test("partner location POST records a server timestamp and browser source", () => {
    assert.match(partnerRouteSource, /recordedAt: new Date\(\)/);
    assert.match(partnerRouteSource, /BROWSER_GPS/);
    assert.doesNotMatch(partnerRouteSource, /recordedAt\s*:\s*body|body\.recordedAt/);
});

test("admin location route is read-only and requires an admin", () => {
    assert.match(adminRouteSource, /getCurrentAdmin\(\)/);
    assert.match(adminRouteSource, /export async function GET/);
    assert.doesNotMatch(adminRouteSource, /export async function POST|export async function PUT/);
    assert.doesNotMatch(adminRouteSource, /create\(|update\(|delete\(/);
});

test("partner location UI now uses watchPosition for live sharing", () => {
    assert.match(locationTabSource, /watchPosition/);
    assert.match(locationTabSource, /clearWatch/);
    assert.match(locationTabSource, /Mulai Bagikan Lokasi/);
    assert.match(locationTabSource, /Berhenti Bagikan Lokasi/);
});
