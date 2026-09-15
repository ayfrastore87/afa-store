# AFA STORE — Android / Play Store Preparation

Dokumen ini menjelaskan strategi untuk membawa AFA STORE ke Android (dan kelak
Google Play Store) **tanpa** membuat aplikasi, backend, atau database kedua.
AFA STORE tetap berjalan dari satu production origin:

- **Production origin:** `https://afastore.online`
- **Teknologi:** Next.js App Router (PWA) + Trusted Web Activity (TWA)

---

## 1. Strategi

1. AFA STORE sudah menjadi **PWA installable** (manifest + ikon 192/512 +
   `display: standalone` + HTTPS). Pengguna Android dapat meng-install langsung
   dari Chrome ("Tambahkan ke layar utama" / "Install app").
2. Untuk distribusi di **Google Play Store**, gunakan **Trusted Web Activity
   (TWA)**. TWA membungkus origin `https://afastore.online` di dalam WebView
   Android yang sudah terverifikasi, sehingga aplikasi Play Store menampilkan
   konten yang sama persis dengan web (satu codebase).

> Tidak perlu membuat APK/AAB manual dari source code baru, dan tidak perlu
> backend kedua. TWA hanyalah "shell" Android yang menunjuk ke origin ini.

---

## 2. Package name (REKOMENDASI — belum final)

Konvensi package name Android adalah reverse-DNS dari domain. Untuk domain
`afastore.online`, rekomendasi awal:

```
online.afastore.app
```

Alternatif lain yang juga valid:

- `online.afastore.twa`
- `id.afastore.app`

> ⚠️ **Belum finalisasi tanpa approval pemilik.** Package name bersifat
> permanen di Play Store dan tidak bisa diubah setelah publish. Pilih satu
> yang jelas milik AFA STORE (sebaiknya yang sesuai dengan domain yang
> dikontrol penuh).

---

## 3. Digital Asset Links (Wajib untuk TWA)

TWA hanya akan dianggap "milik" AFA STORE (bukan browser biasa) jika Android
dapat memverifikasi hubungan antara aplikasi dan origin. Ini dilakukan lewat
file **Digital Asset Links** yang disajikan di:

```
https://afastore.online/.well-known/assetlinks.json
```

Isi minimal (ganti `PACKAGE_NAME` dan `SHA256_FINGERPRINT` sesuai hasil build):

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "online.afastore.app",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"
      ]
    }
  }
]
```

- File ini harus di-deploy di **root origin** `https://afastore.online` (dapat
  diimplementasikan sebagai route Next.js di `src/app/.well-known/...` atau
  static file).
- `sha256_cert_fingerprints` diambil dari **signing certificate** APK/AAB
  (lihat bagian berikutnya).

---

## 4. Signing certificate SHA-256

Play Store memerlukan **app signing key**. Nilai SHA-256 fingerprint dari
certificate ini harus dicantumkan di `assetlinks.json`.

Cara memperolehnya (setelah keystore/Play App Signing tersedia):

```bash
keytool -list -v -keystore <your-key>.keystore -alias <alias> | \
  grep -i "SHA256" | sed 's/SHA256: //' | tr 'a-f' 'A-F' | tr -d ' ' | \
  sed 's/\(..\)/\1:/g; s/:$//'
```

> 🔒 **Jangan membuat signing key di repo ini dan jangan menyimpan
> password/keystore di repository.** Keystore dan credential disimpan di luar
> repo (vault/CI secret). Jika menggunakan **Play App Signing**, Play Store
> yang memegang app signing key dan memberikan "upload key" — fingerprint yang
> dipakai di `assetlinks.json` adalah fingerprint dari **app signing key**
> (dapat dilihat di Play Console > Setup > App integrity).

---

## 5. Langkah Bubblewrap / TWA (garis besar)

Gunakan [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (CLI resmi
Google) untuk membuat project TWA:

```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://afastore.online/manifest.webmanifest
```

Konfigurasi utama:

- **Domain/launch URL:** `https://afastore.online`
- **Package name:** `online.afastore.app` (sesuai keputusan final)
- **Signing:** keystore milik AFA STORE (upload key) atau Play App Signing
- **Digital Asset Links:** pastikan `assetlinks.json` sudah live sebelum rilis

Kemudian build & verify:

```bash
bubblewrap build
bubblewrap install   # untuk uji di perangkat/emulator
```

Output akhir berupa AAB yang diunggah ke Play Console.

---

## 6. Requirement icon & splash

- **Manifest icons:** `192x192` dan `512x512` (sudah ada di
  `public/icons/icon-*.png`), termasuk varian **maskable**.
- **Play Store listing icon:** PNG **512x512**, tanpa transparansi (latar
  solid), konten logo berada di zona aman tengah. Gunakan varian maskable /
  logo AFA yang sudah disiapkan sebagai basis.
- **Splash (Android 12+):** dihasilkan otomatis dari `background_color`
  (`#F8F5EE`) + ikon maskable. **Android < 12:** splash screen disesuaikan di
  konfigurasi Bubblewrap/TWA.
- **Feature graphic (opsional):** 1024x500 untuk tampilan Play Store.

---

## 7. Requirement Play Console

- Akun **Google Play Developer** (berbayar, satu kali).
- App listing: nama "AFA STORE", deskripsi, ikon, screenshot (min. 2, ideal
  ~8), kategori (Shopping), rating konten (Content rating questionnaire).
- **Privacy policy URL** (wajib — lihat bagian 8).
- **Data safety form** (Play Console): deklarasi data yang dikumpulkan
  (akun, pembayaran, alamat, dsb.) sesuai perilaku AFA STORE.
- **App content:** deklarasi iklan (jika ada), dan kebijakan pembayaran
  Midtrans/QRIS yang digunakan.

---

## 8. Privacy policy requirement

Wajib menyediakan halaman **Privacy Policy** yang dapat diakses publik, misal:

```
https://afastore.online/kebijakan-privasi
```

Minimal mencakup:

- Data apa yang dikumpulkan (nama, email, no. HP, alamat pengiriman, riwayat
  transaksi).
- Tujuan penggunaan data.
- Dasar hukum / persetujuan.
- Penyimpanan & keamanan data.
- Pihak ketiga (Supabase, Midtrans, Biteship).
- Hak pengguna & kontak penghapusan data.

URL ini dicantumkan di Play Console (Data safety & Privacy policy).

---

## 9. Testing checklist Android

Sebelum publish ke Play Store:

- [ ] `https://afastore.online/.well-known/assetlinks.json` mengembalikan 200
      dan berisi fingerprint yang benar.
- [ ] Manifest valid (Chrome DevTools > Application > Manifest tidak ada
      error; ikon 192 & 512 terdeteksi).
- [ ] Install PWA dari Chrome Android → ikon "AFA STORE" muncul, launch dari
      home screen, tampil **standalone** (tanpa address bar browser).
- [ ] Splash/theme: warna cream `#F8F5EE` + dark green `#123524` sesuai brand.
- [ ] Tidak ada horizontal overflow di 360px / 390px / 430px.
- [ ] Login, cart, checkout, pilih lokasi (fullscreen map), pembayaran QRIS,
      account/orders berjalan normal dari mode standalone.
- [ ] Midtrans/Biteship/redirect pembayaran eksternal tetap berfungsi
      (TWA mengizinkan navigasi keluar untuk pembayaran).
- [ ] Deep link / navigasi internal tidak "keluar" dari TWA secara salah.
- [ ] TWA build diinstall via `bubblewrap install` dan membuka origin yang
      benar tanpa fallback ke browser (custom tab).

---

## 10. Yang masih diperlukan sebelum membuat AAB

1. **Finalisasi package name** (approval pemilik).
2. **Membuat keystore/signing key** (di luar repo) + catat SHA-256 fingerprint.
3. **Menyediakan `/.well-known/assetlinks.json`** di production dengan
   package name + fingerprint final.
4. **Menyediakan halaman Privacy Policy** publik.
5. Menyiapkan aset Play Store (ikon 512, screenshot, feature graphic).
6. Membuat akun Google Play Developer.
7. Menjalankan `bubblewrap init` + `bubblewrap build` dan uji di perangkat.
