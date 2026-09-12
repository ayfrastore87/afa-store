import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const statusSource = fs.readFileSync(new URL("../src/lib/location-status.ts", import.meta.url), "utf8");
const schemaSource = fs.readFileSync(new URL("../src/lib/partner-location.ts", import.meta.url), "utf8");
const adminPanelSource = fs.readFileSync(new URL("../src/components/admin/PartnerLocationPanel.tsx", import.meta.url), "utf8");
const detailPanelSource = fs.readFileSync(new URL("../src/components/admin/PartnerAdminDetailPanel.tsx", import.meta.url), "utf8");
const cardSource = fs.readFileSync(new URL("../src/components/partner/live-location-card.tsx", import.meta.url), "utf8");

test("location-status exports LIVE/OFFLINE + accuracy helpers (client-safe, no server-only)", () => {
    assert.match(statusSource, /getLocationLiveStatus/);
    assert.match(statusSource, /getAccuracyQuality/);
    assert.match(statusSource, /LOCATION_LIVE_WINDOW_MS = 60_000/);
    assert.doesNotMatch(statusSource, /^import "server-only"/m);
});

test("LIVE window is 60s and status derived from recordedAt", () => {
    assert.match(statusSource, /now - time <= LOCATION_LIVE_WINDOW_MS/);
});

test("accuracy has a server-side upper bound", () => {
    assert.match(schemaSource, /ACCURACY_MAX/);
    assert.match(schemaSource, /n <= ACCURACY_MAX/);
});

test("admin map polls (~15s) and opens Google Maps external navigation", () => {
    assert.match(adminPanelSource, /POLL_INTERVAL_MS = 15000/);
    assert.match(adminPanelSource, /setInterval/);
    assert.match(adminPanelSource, /clearInterval/);
    assert.match(adminPanelSource, /google\.com\/maps/);
    assert.match(adminPanelSource, /encodeURIComponent/);
});

test("admin detail panel links to the live map", () => {
    assert.match(detailPanelSource, /Lihat Live Map/);
    assert.match(detailPanelSource, /\/admin\/mitra\/\$\{partner\.id\}\/lokasi/);
});

test("partner live location card is opt-in, not auto-started", () => {
    assert.match(cardSource, /Mulai Bagikan Lokasi/);
    assert.match(cardSource, /Berhenti Bagikan Lokasi/);
    assert.match(cardSource, /watchPosition/);
    // No automatic start on mount: watchPosition is only called from `start`.
    assert.doesNotMatch(cardSource, /useEffect\(\(\) => \{[^}]*watchPosition/s);
});
