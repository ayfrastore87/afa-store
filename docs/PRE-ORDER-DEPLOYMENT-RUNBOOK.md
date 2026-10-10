# Pre-Order (PO) — Runbook Migrasi & Deploy Produksi

Status: **DRAFT — menunggu persetujuan**. Tidak ada langkah di dokumen ini yang sudah dijalankan ke produksi.

## 1. Ringkasan perubahan

| Area | Perubahan | Dampak ke alur lama |
|---|---|---|
| Schema | 3 tabel baru `pre_orders`, `pre_order_items`, `pre_order_payments` (status disimpan `TEXT`, tanpa enum DB); kolom `publicToken` unik | **Tidak ada** perubahan pada tabel `orders`, `payments`, `products`, `users`. Migrasi additive murni (hanya `CREATE`). |
| API | `/api/admin/pre-orders*`, `/api/admin/kasir/pre-orders*`, `/api/pre-orders` (login), `/api/pre-orders/guest` (tanpa login), `/api/pre-orders/track/[token]` (publik) | Checkout, guest-checkout, Midtrans webhook, WhatsApp tidak disentuh (webhook hanya mendapat cabang baru untuk `PO-` orderId). |
| UI | Halaman `/pre-order` (form tamu), `/pre-order/[token]` (lacak), panel PO di admin & kasir, link di footer | Halaman lama tidak berubah. |

Migrasi: `prisma/migrations/20261010000000_add_pre_orders/migration.sql` — **belum diterapkan** di produksi (dikonfirmasi via `prisma migrate status`).

## 2. Prasyarat

- Semua gate lokal hijau: `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`.
- Koneksi DB: host `DIRECT_URL` (db.*.supabase.co) **hanya IPv6** dan tidak terjangkau dari mesin ini. Gunakan **Session Pooler** (`aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.<project-ref>`) — port 5432 sudah diverifikasi reachable via `Test-NetConnection`.
- Jangan ubah `.env`/`.env.local` di repo; set URL hanya di shell saat menjalankan perintah.
- Jendela deploy: saat trafik rendah; migrasi hanya `CREATE TABLE/INDEX/TYPE`, tidak mengunci tabel lama.

## 3. Backup (WAJIB sebelum migrasi)

Tidak ada `pg_dump` di mesin ini, jadi gunakan salah satu:

1. **Supabase Dashboard → Database → Backups** → catat waktu backup harian terakhir, atau trigger backup manual jika plan mendukung (PITR).
2. Alternatif (jika `pg_dump` tersedia di mesin lain):
   ```powershell
   $env:PGPASSWORD="<password>"
   pg_dump -h aws-0-ap-southeast-1.pooler.supabase.com -p 5432 -U postgres.<ref> -d postgres -Fc -f "backups/prod-before-pre-orders-$(Get-Date -Format yyyyMMdd-HHmm).dump"
   ```
3. Minimal: ekspor CSV tabel `_prisma_migrations` dari SQL editor agar daftar migrasi tercatat.

Checklist: ☐ backup ada & terverifikasi ☐ waktu backup dicatat di catatan deploy.

## 4. Verifikasi status migrasi (read-only)

```powershell
cd "D:\AFA FOOD\afa-store"
$env:DATABASE_URL = "<SESSION_POOLER_URL>"   # hanya di shell ini
npx prisma migrate status
```
Ekspektasi: semua migrasi sebelumnya `Applied`, hanya `20261010000000_add_pre_orders` yang `Not yet applied`. Jika ada migrasi lain yang pending/failed → **STOP**, laporkan.

## 5. Terapkan migrasi

```powershell
npx prisma migrate deploy
npx prisma migrate status      # harus: "Database schema is up to date!"
```
Verifikasi di SQL editor:
```sql
select table_name from information_schema.tables where table_name like 'pre_order%';
select indexname from pg_indexes where tablename='pre_orders';   -- harus ada pre_orders_publicToken_key
select migration_name, finished_at from _prisma_migrations order by finished_at desc limit 3;
```

## 6. Deploy aplikasi

1. Commit & push (lihat §9 — dua commit terpisah).
2. Deploy (Vercel/host yang dipakai) dari commit tersebut. Pastikan env `DATABASE_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER` sudah ada di host.
3. Urutan aman: **migrasi dulu, lalu deploy app**. Kode baru membutuhkan tabel; kode lama tidak terpengaruh oleh tabel baru.

## 7. Smoke test pasca-deploy

| # | Langkah | Hasil diharapkan |
|---|---|---|
| 1 | Buka `/pre-order` (tanpa login) | Form tampil, produk termuat |
| 2 | Ajukan PO 1 item | Redirect ke `/pre-order/<token>?baru=1`, status *Menunggu Konfirmasi* |
| 3 | Kirim ulang form yang sama (double-click) | Tidak ada PO ganda (replay → PO sama) |
| 4 | Kasir → PO → filter *Menunggu Konfirmasi* | PO tampil dengan badge **Website**; tombol *Konfirmasi* |
| 5 | Konfirmasi → terima DP → cetak struk | Status Dikonfirmasi, paymentStatus PARTIAL, halaman lacak ikut berubah |
| 6 | Lunasi → serah terima | HANDED_OVER, lacak menampilkan *Selesai* |
| 7 | Checkout biasa + WA biasa | Berjalan seperti sebelumnya (regresi) |
| 8 | `GET /api/pre-orders/track/abc` | 404, tanpa data |

## 8. Rollback

Aplikasi: redeploy commit sebelumnya (tabel baru tidak mengganggu kode lama).

Database (hanya jika benar-benar perlu, data PO akan hilang):
```sql
begin;
drop table if exists pre_order_payments;
drop table if exists pre_order_items;
drop table if exists pre_orders;
delete from _prisma_migrations where migration_name = '20261010000000_add_pre_orders';
commit;
```
(Migrasi tidak membuat enum Postgres — status/source/kind disimpan sebagai `TEXT`, jadi tidak ada `DROP TYPE`.)

## 9. Rencana commit (menunggu persetujuan)

1. **Commit A — kategori admin** (tidak terkait PO): `src/app/admin/(protected)/categories/*`, `src/app/api/categories/route.ts`, `tests/categories-admin.test.mjs`.
2. **Commit B — Pre-Order + guest flow**: schema, migrasi, `src/lib/pre-order*.ts`, semua route/halaman/komponen PO, laporan kasir & struk thermal, footer, webhook branch, nav, `tests/pre-order-guest.test.mjs`, dokumen ini.
3. `MIDTRANS_AUDIT_REPORT.md` — **tidak** di-commit kecuali disetujui.

## 10. Catatan keterbatasan

- Rate limit IP guest PO bersifat in-memory per instance (best-effort di serverless); pengaman lintas instance adalah cap per nomor HP di DB (maks 3 DRAFT terbuka, 5/hari).
- Token lacak = 24 byte acak base64url; siapa pun yang memegang URL dapat melihat status (sama seperti `/pesanan/[publicToken]`). Nomor HP dan ID internal tidak ditampilkan.
- `migration_lock.toml` tidak ada di repo (kondisi lama) — `migrate deploy` tetap bekerja; dapat dibuat belakangan dengan `provider = "postgresql"`.
