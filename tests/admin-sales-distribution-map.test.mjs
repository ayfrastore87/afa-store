import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
const map = read("src/components/admin/consignment/ConsignmentStoreMap.tsx");
const page = read("src/app/admin/(protected)/sales/map/page.tsx");
const loader = read("src/lib/google-maps-loader.ts");

test("map UX exposes add-store CTA and zero-store empty state", () => {
    assert.match(map, /Tambah Titik Jual/);
    assert.match(map, /Belum Ada Titik Jual/);
    assert.match(map, /Daftarkan Titik Jual Pertama/);
    assert.match(map, /Lokasi akan tampil otomatis setelah koordinat GPS disimpan/);
    assert.match(map, /const CREATE_STORE_URL = "\/admin\/titip-jual"/);
});

test("GPS-missing state lists stores and links to existing detail/location flow", () => {
    assert.match(map, /Titik Jual Belum Memiliki GPS/);
    assert.match(map, /Lengkapi Lokasi/);
    assert.match(map, /latitude.*longitude/);
    assert.doesNotMatch(map, /geocode|Geocoder/);
});

test("filters and sidebar data use store name, address, sales, GPS, and real stock", () => {
    assert.match(map, /Cari toko atau alamat/);
    assert.match(map, /Semua Sales/);
    assert.match(map, /Ada Stok/);
    assert.match(map, /Stok Habis/);
    assert.match(map, /Ada GPS/);
    assert.match(map, /Kunjungan terakhir/);
    assert.match(map, /Titik Jual \(\{stores.length\}\)/);
});

test("markers reject fake coordinates and use fitBounds or a single-marker zoom", () => {
    assert.match(map, /hasValidCoordinates/);
    assert.match(map, /points = useMemo\(\(\) => filtered\.filter\(hasValidCoordinates\)/);
    assert.match(map, /points.length === 1 \? 15 : 12/);
    assert.match(map, /map\.fitBounds\(bounds\)/);
    assert.match(map, /query=\$\{store\.latitude\},\$\{store\.longitude\}/);
});

test("admin authorization and singleton Maps loader remain unchanged", () => {
    assert.match(page, /await requireAdmin\(\)/);
    assert.match(map, /loadGoogleMaps\(\)/);
    assert.match(map, /getGoogleMapsApi\(\)/);
    assert.match(loader, /let loadPromise/);
    assert.doesNotMatch(map, /maps\.googleapis\.com\/maps\/api\/js/);
});