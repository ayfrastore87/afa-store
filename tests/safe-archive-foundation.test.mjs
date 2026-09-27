import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), "utf8");
const orderRoute = read("src/app/api/admin/orders/[id]/route.ts");
const orders = read("src/app/api/admin/orders/route.ts");
const kasirOrders = read("src/app/api/admin/kasir/orders/route.ts");
const sales = read("src/app/api/admin/consignment/salespeople/route.ts");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260927030000_add_order_archive/migration.sql");
const mitraAuth = read("src/lib/mitra-auth.ts");
const orderDetail = read("src/components/admin/orders/OrderDetail.tsx");
const customerOrders = read("src/app/api/account/orders/route.ts");

test("admin archive is additive and never deletes historical order relations", () => {
  assert.match(orderRoute, /export async function DELETE/);
  assert.match(orderRoute, /getCurrentAdmin\(\)/);
  assert.match(orderRoute, /prisma\.order\.updateMany/);
  assert.match(orderRoute, /deletedAt: new Date\(\)/);
  assert.doesNotMatch(orderRoute, /prisma\.order\.delete/);
  assert.doesNotMatch(orderRoute, /items\.delete|payment\.delete|checkoutHistories/);
});

test("order archive uses the existing SweetAlert confirmation UX", () => {
  assert.match(orderDetail, /from "sweetalert2"/);
  assert.match(orderDetail, /title: "Hapus pesanan\?"/);
  assert.match(orderDetail, /text: "Pesanan akan dihapus dari daftar aktif, tetapi riwayat transaksi tetap tersimpan untuk laporan\."/);
  assert.match(orderDetail, /confirmButtonText: "Hapus Pesanan"/);
  assert.match(orderDetail, /cancelButtonText: "Batal"/);
  assert.match(orderDetail, /showLoaderOnConfirm: true/);
  assert.match(orderDetail, /Swal\.showValidationMessage/);
  assert.match(orderDetail, /title: "Pesanan berhasil diarsipkan"/);
  assert.doesNotMatch(orderDetail, /window\.confirm/);
});

test("active operational order lists exclude archived orders", () => {
  assert.match(orders, /where\.deletedAt = null/);
  assert.match(kasirOrders, /deletedAt: null/);
});

test("customer order history remains historical rather than operational", () => {
  assert.match(customerOrders, /where: \{ userId: user\.id \}/);
  assert.doesNotMatch(customerOrders, /deletedAt: null/);
});

test("archive schema and migration are additive", () => {
  assert.match(schema, /deletedAt\s+DateTime\?/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP\(3\)/);
  assert.doesNotMatch(migration, /DROP|DELETE FROM|CASCADE/i);
});

test("sales deactivation blocks assigned active stores and preserves history", () => {
  assert.match(sales, /body\.isActive === false/);
  assert.match(sales, /consignmentStore\.count/);
  assert.match(sales, /Pindahkan toko aktif terlebih dahulu/);
  assert.match(sales, /tx\.user\.update/);
  assert.match(sales, /tx\.salesPerson\.update/);
  assert.doesNotMatch(sales, /salesVisit\.delete|storePayment\.delete/);
});

test("inactive account and Mitra access remain server-side gated", () => {
  const auth = read("src/lib/server-auth.ts");
  assert.match(auth, /user\.isActive === false/);
  assert.match(auth, /sales\.isActive === false/);
  assert.match(mitraAuth, /account\.partner\.status/);
  assert.doesNotMatch(mitraAuth, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("service role client is server-only", () => {
  const adminClient = read("src/lib/supabase-admin.ts");
  assert.match(adminClient, /server-only/);
  for (const file of fs.readdirSync(new URL("src", root), { recursive: true })) {
    if (typeof file === "string" && /\.(tsx?|mjs)$/.test(file) && file.includes("components")) {
      assert.doesNotMatch(read(`src/${file.replace(/^src[\\/]/, "")}`), /SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient/);
    }
  }
});