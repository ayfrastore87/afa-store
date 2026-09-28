import type { Metadata } from "next";
import Link from "next/link";
import PremiumFooter from "@/components/premium-footer";

export const metadata: Metadata = {
  title: "Tentang Kami & Informasi Legal | AFA STORE",
  description:
    "AFA STORE — Bawang Goreng Premium & Parcel Hampers. Nama usaha terdaftar: IRMA RATNA MARYANI. NIB: 2411220051724. Alamat: Komp. Griya Praja Mandiri Blok C06 No 06, Cibeber, Kec. Cibeber, Kota Cilegon, Banten 42422.",
  alternates: { canonical: "https://afastore.online/tentang-kami" },
};

export default function TentangKamiPage() {
  return (
    <>
      <main className="min-h-screen bg-[#F8F5EE] text-[#123524]">
        {/* ── Breadcrumb nav ───────────────────────────────── */}
        <nav
          aria-label="Breadcrumb"
          className="border-b border-[#123524]/10 bg-[#F8F5EE] px-5 py-3 text-[13px] sm:px-8 lg:px-12"
        >
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="text-[#184D47] hover:underline">
                Beranda
              </Link>
            </li>
            <li aria-hidden="true" className="text-[#123524]/40">
              /
            </li>
            <li className="font-medium" aria-current="page">
              Tentang Kami
            </li>
          </ol>
        </nav>

        {/* ── Page content ─────────────────────────────────── */}
        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 lg:px-12">

          {/* Brand header */}
          <header className="mb-8">
            <h1 className="font-display text-3xl font-bold tracking-tight text-[#123524] sm:text-4xl">
              AFA STORE
            </h1>
            <p className="mt-2 text-base text-[#184D47]">
              Bawang Goreng Premium &amp; Parcel Hampers Berkualitas
            </p>
          </header>

          {/* About section */}
          <section className="mb-8 prose prose-sm max-w-none text-[#2E2A26]" aria-label="Tentang AFA STORE">
            <h2 className="text-xl font-semibold text-[#123524]">Tentang AFA STORE</h2>
            <p className="mt-3 leading-relaxed">
              AFA STORE adalah toko online yang menghadirkan produk bawang goreng premium, parcel,
              dan hampers berkualitas pilihan. Kami melayani pengiriman ke seluruh Indonesia dengan
              proses pemesanan yang mudah dan cepat.
            </p>
          </section>

          {/* ── Legal Identity Block ────────────────────────── */}
          <section
            className="rounded-2xl border border-[#123524]/10 bg-white p-6 shadow-sm"
            aria-label="Informasi Legal Usaha"
          >
            <h2 className="text-lg font-semibold text-[#123524]">
              Informasi Legal Usaha
            </h2>

            <dl className="mt-4 grid gap-3 text-[14px] leading-relaxed text-[#2E2A26]">
              <div className="grid grid-cols-[auto_1fr] gap-x-4">
                <dt className="font-medium text-[#123524] whitespace-nowrap">Nama dagang</dt>
                <dd>AFA STORE</dd>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-x-4">
                <dt className="font-medium text-[#123524] whitespace-nowrap">
                  Nama usaha terdaftar
                </dt>
                <dd>
                  <strong className="font-semibold">IRMA RATNA MARYANI</strong>
                </dd>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-x-4">
                <dt className="font-medium text-[#123524] whitespace-nowrap">NIB</dt>
                <dd>2411220051724</dd>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-x-4">
                <dt className="font-medium text-[#123524] whitespace-nowrap">Alamat</dt>
                <dd>
                  <address className="not-italic">
                    Komp. Griya Praja Mandiri Blok C06 No 06,
                    <br />
                    Cibeber, Kec. Cibeber,
                    <br />
                    Kota Cilegon, Banten 42422
                  </address>
                </dd>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-x-4">
                <dt className="font-medium text-[#123524] whitespace-nowrap">WhatsApp</dt>
                <dd>
                  <a
                    href="https://wa.me/6287770000883"
                    className="text-[#184D47] hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    087770000883
                  </a>
                </dd>
              </div>

              <div className="grid grid-cols-[auto_1fr] gap-x-4">
                <dt className="font-medium text-[#123524] whitespace-nowrap">Website</dt>
                <dd>
                  <a
                    href="https://afastore.online"
                    className="text-[#184D47] hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    afastore.online
                  </a>
                </dd>
              </div>
            </dl>

            <p className="mt-5 text-[13px] leading-relaxed text-[#5C5444]">
              AFA STORE adalah nama dagang usaha yang terdaftar atas nama{" "}
              <strong className="font-semibold text-[#123524]">IRMA RATNA MARYANI</strong>.
              NIB (Nomor Induk Berusaha): <strong className="font-semibold text-[#123524]">2411220051724</strong>.
            </p>
          </section>

          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full bg-[#123524] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#184D47] transition"
            >
              ← Kembali ke Beranda
            </Link>
          </div>
        </div>
      </main>

      <PremiumFooter />
    </>
  );
}
