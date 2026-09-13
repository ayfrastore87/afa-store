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

test("/mitra resolves ACTIVE -> dashboard, ACTIVE+view=business -> landing, unauthenticated -> landing", () => {
    const page = read("../src/app/mitra/page.tsx");
    assert.ok(page.includes("resolveMitra()"));
    assert.ok(page.includes('route.kind === "active"'));
    assert.ok(page.includes('params.view !== "business"'));
    assert.ok(page.includes('redirect("/mitra/dashboard")'));
    assert.ok(page.includes("<MitraLanding"));
});

test("authenticated logo/brand points to /mitra?view=business (business concept)", () => {
    const shell = read("../src/components/mitra/mitra-shell.tsx");
    assert.ok(shell.includes('href="/mitra?view=business"'));
    assert.ok(shell.includes("AFA MITRA"));
    assert.ok(shell.includes("Partner Bisnis AFA STORE"));
});

test("business concept page shows Dashboard/Akun (not Daftar) for ACTIVE partners", () => {
    const landing = read("../src/components/mitra/mitra-landing.tsx");
    assert.ok(landing.includes("isActive"));
    assert.ok(landing.includes('href="/mitra/dashboard"'));
    assert.ok(landing.includes('href="/mitra/profil"'));
    assert.ok(landing.includes("Dashboard"));
    assert.ok(landing.includes("Akun"));
});

test("public landing hero keeps a single CTA (no duplicated 'Masuk Mitra' in hero)", () => {
    const landing = read("../src/components/mitra/mitra-landing.tsx");
    assert.ok(landing.includes("Daftar AFA MITRA"));
    assert.ok(landing.includes("Pelajari Cara Kerjanya"));
    // "Masuk Mitra" was removed from the hero; it now only remains in the final
    // conversion CTA and the footer (2 occurrences) instead of 3.
    const occurrences = landing.split("Masuk Mitra").length - 1;
    assert.equal(occurrences, 2, "hero should no longer duplicate 'Masuk Mitra'");
});
