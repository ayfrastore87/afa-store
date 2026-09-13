import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// AFA MITRA — Fase 2 routing/authorization tests.
// Asserts the /mitra/* presentation layer is driven by the standalone Mitra
// session (afa_mitra_session → MitraAccount → Partner), gates operational
// routes to ACTIVE partners only, and never trusts client-supplied
// partnerId/userId authority.

function read(rel) {
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
}

const gate = read("../src/lib/mitra-auth.ts");

test("mitra gate derives authority from MitraAccount/partnerId, never from the customer user", () => {
    assert.match(gate, /prisma\.mitraAccount\.findUnique/);
    assert.match(gate, /include: \{ partner: true \}/);
    assert.match(gate, /status === "ACTIVE"/);
    assert.match(gate, /status === "SUSPENDED"/);
    assert.match(gate, /status === "REJECTED"/);
    assert.doesNotMatch(gate, /getCurrentUser\(\)/);
    assert.doesNotMatch(gate, /partnerId\s*=\s*request\./);
    assert.doesNotMatch(gate, /body\.partnerId|body\.userId/);
});

test("operational routes redirect non-active statuses before rendering", () => {
    assert.ok(gate.includes('redirect("/mitra/login")'));
    assert.ok(gate.includes('redirect("/mitra/pengajuan")'));
});

test("unauthenticated /mitra/dashboard is rejected via requireActiveMitra", () => {
    const dashboard = read("../src/app/mitra/dashboard/page.tsx");
    assert.ok(dashboard.includes("requireActiveMitra()"));
    assert.ok(dashboard.includes('dynamic = "force-dynamic"'));
});

test("every operational /mitra/* page is gated by requireActiveMitra", () => {
    for (const page of ["dashboard", "kasir", "laporan", "lokasi", "penjualan", "produk", "profil", "stok"]) {
        const src = read(`../src/app/mitra/${page}/page.tsx`);
        assert.ok(src.includes("requireActiveMitra()"), `/${page} should call requireActiveMitra()`);
    }
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

test("daftar submits the standalone Mitra registration endpoint", () => {
    const app = read("../src/components/mitra/mitra-application.tsx");
    assert.ok(app.includes('fetch("/api/mitra/auth/register"'));
    assert.ok(app.includes('method: "POST"'));
    assert.ok(app.includes("username"));
    assert.ok(app.includes("confirmPassword"));
    assert.ok(app.includes("partnerType"));
    assert.ok(app.includes("displayName"));
    assert.ok(app.includes("businessName"));
    // Standalone: never creates a customer user.
    assert.doesNotMatch(app, /\/api\/account\/partner\/apply/);
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

test("mitra profile is Mitra-session based and never touches customer auth", () => {
    const profile = read("../src/components/mitra/mitra-profile.tsx");
    assert.ok(profile.includes('fetch("/api/mitra/auth/me"'));
    assert.ok(profile.includes('fetch("/api/mitra/auth/logout"'));
    assert.doesNotMatch(profile, /\/api\/account\/partner/);
    assert.doesNotMatch(profile, /\/api\/auth\/logout/);
});
