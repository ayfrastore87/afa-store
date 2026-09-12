import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// AFA MITRA — Tahap 20 routing/authorization tests.
// Asserts the /mitra/* presentation layer reuses the existing Partner model +
// auth (no second backend) and gates operational routes to ACTIVE partners
// only, with no client-supplied partnerId/userId authority.

function read(rel) {
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
}

const gate = read("../src/lib/mitra-auth.ts");

test("mitra gate derives status from session user, never from request authority", () => {
    assert.match(gate, /getCurrentUser\(\)/);
    assert.ok(gate.includes("findUnique({ where: { userId: user.id } })"));
    assert.ok(gate.includes('status === "ACTIVE"'));
    assert.ok(gate.includes('status === "SUSPENDED"'));
    assert.ok(gate.includes('status === "REJECTED"'));
    assert.doesNotMatch(gate, /partnerId\s*=\s*request\./);
    assert.doesNotMatch(gate, /body\.partnerId|body\.userId/);
});

test("operational routes redirect non-active statuses before rendering", () => {
    assert.ok(gate.includes('redirect("/mitra/login'));
    assert.ok(gate.includes('redirect("/mitra/daftar")'));
    assert.ok(gate.includes('redirect("/mitra/pengajuan")'));
});

test("unauthenticated /mitra/dashboard is rejected via the gate", () => {
    const dashboard = read("../src/app/mitra/dashboard/page.tsx");
    assert.ok(dashboard.includes("gateMitraActive()"));
    assert.ok(dashboard.includes('dynamic = "force-dynamic"'));
});

test("status route redirects ACTIVE and renders non-active statuses", () => {
    const pengajuan = read("../src/app/mitra/pengajuan/page.tsx");
    assert.ok(pengajuan.includes('redirect("/mitra/dashboard")'));
    assert.ok(pengajuan.includes("MitraStatus"));
    const status = read("../src/components/mitra/mitra-application.tsx");
    assert.ok(status.includes("Pengajuan Sedang Ditinjau"));
    assert.ok(status.includes("Pengajuan Belum Disetujui"));
    assert.ok(status.includes("Akun Mitra Ditangguhkan"));
});

test("daftar reuses the existing POST /api/account/partner/apply endpoint", () => {
    const app = read("../src/components/mitra/mitra-application.tsx");
    assert.ok(app.includes('fetch("/api/account/partner/apply"'));
    assert.ok(app.includes('method: "POST"'));
    assert.ok(app.includes("partnerType"));
    assert.ok(app.includes("displayName"));
    assert.ok(app.includes("businessName"));
});

test("mitra operation tabs reuse existing partner components, no duplicated models", () => {
    const ops = read("../src/components/mitra/mitra-operations.tsx");
    assert.ok(ops.includes('@/components/partner/stock-tab'));
    assert.ok(ops.includes('@/components/partner/pos-tab'));
    assert.ok(ops.includes('@/components/partner/history-tab'));
    assert.ok(ops.includes('@/components/partner/reports-tab'));
    assert.ok(ops.includes('@/components/partner/location-tab'));
    assert.doesNotMatch(ops, /new PrismaClient/);
});

test("no second Partner / sale / stock writer is introduced in the mitra app", () => {
    const shell = read("../src/components/mitra/mitra-shell.tsx");
    const dashboard = read("../src/components/mitra/mitra-dashboard.tsx");
    const produk = read("../src/components/mitra/mitra-produk.tsx");
    for (const src of [shell, dashboard, produk]) {
        assert.doesNotMatch(src, /prisma\s*\.\s*(partnerSale|partnerStock)\.(create|upsert|updateMany|deleteMany)/);
    }
});
