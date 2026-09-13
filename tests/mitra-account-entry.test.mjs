import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// AFA MITRA — account entry + header entry + admin approval tests.
// Asserts the "Jadi Mitra" entrance (header/nav/footer + /account card) reuses
// the existing Partner status flow and admin panel, without any new model/API.

function read(rel) {
    return fs.readFileSync(new URL(rel, import.meta.url), "utf8");
}

const home = read("../src/app/page.tsx");
const account = read("../src/components/account/account-dashboard.tsx");
const adminPanel = read("../src/components/admin/PartnerAdminPanel.tsx");
const apply = read("../src/app/api/account/partner/apply/route.ts");

test("homepage exposes a 'Jadi Mitra' entrance pointing to /mitra", () => {
    assert.ok(home.includes('href="/mitra"'));
    assert.ok(home.includes("Jadi Mitra"));
    // never deep-link admin or dashboard from the marketing header
    assert.doesNotMatch(home, /href="\/admin\/mitra"/);
    assert.doesNotMatch(home, /href="\/mitra\/dashboard"/);
});

test("account card routes NONE -> daftar with the CTA 'Daftar Jadi Mitra'", () => {
    assert.ok(account.includes("Jadi Mitra AFA STORE"));
    assert.ok(account.includes("Daftar Jadi Mitra"));
    assert.ok(account.includes('"/mitra/daftar"'));
});

test("account card routes PENDING -> pengajuan (Lihat Status)", () => {
    assert.ok(account.includes("Pengajuan Mitra"));
    assert.ok(account.includes("Sedang Ditinjau"));
    assert.ok(account.includes('"/mitra/pengajuan"'));
});

test("account card routes ACTIVE -> dashboard and shows partnerCode", () => {
    assert.ok(account.includes("Mitra Aktif"));
    assert.ok(account.includes("Buka Dashboard Mitra"));
    assert.ok(account.includes('"/mitra/dashboard"'));
    assert.ok(account.includes("partnerCode"));
});

test("account page does NOT create a new Partner (no apply fetch from account)", () => {
    assert.doesNotMatch(account, /fetch\("\/api\/account\/partner\/apply"/);
});

test("admin panel shows PENDING and can approve to ACTIVE / reject to REJECTED", () => {
    assert.match(adminPanel, /\/api\/admin\/partners\/\$\{id\}\/\$\{action\}/);
    assert.match(adminPanel, /action: "approve" \| "reject"/);
    assert.ok(adminPanel.includes("PARTNER_STATUSES"));
    assert.ok(adminPanel.includes('partner.status === "PENDING"'));
    assert.ok(adminPanel.includes('partner.status === "ACTIVE"'));
    assert.ok(adminPanel.includes('act(partner.id, "reject")'));
});

test("duplicate application is blocked at API layer (existing Partner rejected)", () => {
    assert.ok(apply.includes("findUnique({ where: { userId: user.id } })"));
    assert.ok(apply.includes("Anda sudah memiliki pengajuan mitra"));
    assert.ok(apply.includes("status: 409"));
});
