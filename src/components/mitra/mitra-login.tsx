"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
    ArrowLeft,
    Eye,
    EyeOff,
    Handshake,
    Loader2,
    Lock,
    Mail,
    MapPin,
    Receipt,
    ShoppingCart,
    Store,
    Tags,
    TrendingUp,
} from "lucide-react";

import { whatsappUrl } from "@/lib/client-auth";
import {
    MITRA_BG,
    MITRA_GOLD_BTN,
    MITRA_PRIMARY_BTN,
} from "@/components/mitra/mitra-theme";

// ---------------------------------------------------------------------------
// AFA MITRA — standalone login portal (Fase 2). Two-column desktop layout:
// dark-green branding/benefits on the left, a modern login card on the right.
//
// Auth is dedicated to Mitra: this component POSTs to /api/mitra/auth/login
// (afa_mitra_session → MitraAccount). It never writes cookies or tokens itself,
// never stores passwords, and never creates a Partner. The response redirectTo
// (by status) is the source of truth after login.
// ---------------------------------------------------------------------------

const LOGIN_TIMEOUT_MS = 15000;

const BENEFITS = [
    { icon: Tags, label: "Harga khusus Mitra" },
    { icon: ShoppingCart, label: "Kelola stok" },
    { icon: Receipt, label: "Kasir Mitra" },
    { icon: TrendingUp, label: "Laporan penjualan" },
    { icon: Store, label: "Pantau keuntungan" },
    { icon: MapPin, label: "Live Location" },
];

const MOBILE_SUMMARY = "Kelola stok • Kasir • Laporan • Setoran";

function safeNext(next: string | null): string {
    // Mirrors the safe next guard used by the existing account login form:
    // only an internal absolute path, never protocol-relative or with a
    // backslash, and never looping back onto the login page.
    if (
        next &&
        next.startsWith("/") &&
        !next.startsWith("//") &&
        !next.includes("\\") &&
        !next.startsWith("/login") &&
        !next.startsWith("/mitra/login")
    ) {
        return next;
    }
    return "/mitra/dashboard";
}

function loginErrorMessage(status: number): string {
    if (status === 401) return "Username/email atau password tidak sesuai.";
    if (status === 403) return "Akun mitra tidak aktif. Hubungi admin AFA STORE.";
    if (status === 429) return "Terlalu banyak percobaan login. Silakan coba lagi nanti.";
    if (status >= 500) return "Layanan login sedang bermasalah. Silakan coba lagi.";
    return "Login gagal. Silakan coba lagi.";
}

export function MitraLogin() {
    const router = useRouter();
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const requestInFlight = useRef(false);

    const helpHref = whatsappUrl("Halo AFA STORE, saya butuh bantuan untuk masuk ke AFA MITRA.");

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (requestInFlight.current) return;
        if (!identifier.trim() || !password) {
            setError("Username/email dan password wajib diisi.");
            return;
        }

        setError("");
        setLoading(true);
        requestInFlight.current = true;

        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

        try {
            const response = await fetch("/api/mitra/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ identifier, password, remember }),
                signal: controller.signal,
            });

            const data = (await response.json().catch(() => null)) as {
                message?: string;
                redirectTo?: string;
            } | null;

            if (!response.ok) {
                setError(data?.message || loginErrorMessage(response.status));
                return;
            }

            const next = safeNext(
                new URLSearchParams(window.location.search).get("next") || data?.redirectTo || null
            );
            router.replace(next);
        } catch {
            setError("Gagal terhubung. Silakan coba lagi.");
        } finally {
            window.clearTimeout(timeoutId);
            requestInFlight.current = false;
            setLoading(false);
        }
    }

    return (
        <main className={`min-h-screen ${MITRA_BG} text-[#184D47]`}>
            <div className="flex min-h-screen flex-col lg:flex-row">
                {/* ---------- Left: branding + benefits (desktop) ---------- */}
                <aside className="relative hidden overflow-hidden bg-[#0B4A38] text-[#F8F5EE] lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 opacity-10"
                        style={{
                            backgroundImage:
                                "linear-gradient(#C9A45B 1px, transparent 1px), linear-gradient(90deg, #C9A45B 1px, transparent 1px)",
                            backgroundSize: "26px 26px",
                        }}
                    />
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#C9A45B]/20 blur-3xl"
                    />

                    <div className="relative z-10 flex items-center gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#C9A45B] text-[#0B4A38]">
                            <Handshake size={26} />
                        </span>
                        <div className="leading-tight">
                            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#C9A45B]">
                                AFA STORE
                            </p>
                            <p className="text-xl font-black">AFA MITRA</p>
                        </div>
                    </div>

                    <div className="relative z-10">
                        <p className="text-xs font-black uppercase tracking-[0.32em] text-[#C9A45B]">
                            Partner • Reseller • Agen
                        </p>
                        <h1 className="mt-4 max-w-md text-4xl font-black leading-tight">
                            Kelola Usaha Mitra <span className="text-[#C9A45B]">Lebih Mudah</span>
                        </h1>
                        <p className="mt-4 max-w-md text-[#F8F5EE]/75">
                            Pantau stok, catat penjualan, lihat laporan, dan kembangkan usaha bersama AFA STORE.
                        </p>

                        <LoginBenefitList />
                    </div>

                    <p className="relative z-10 text-xs text-[#F8F5EE]/50">
                        © {new Date().getFullYear()} AFA STORE. Semua hak dilindungi.
                    </p>
                </aside>

                {/* ---------- Right: login panel ---------- */}
                <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
                    <div className="w-full max-w-md">
                        {/* Mobile brand header */}
                        <div className="mb-8 flex flex-col items-center text-center lg:hidden">
                            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184D47] text-[#C9A45B]">
                                <Handshake size={28} />
                            </span>
                            <p className="mt-3 text-[11px] font-black uppercase tracking-[0.3em] text-[#C9A45B]">
                                AFA STORE MITRA
                            </p>
                            <h1 className="mt-1 text-2xl font-black text-[#184D47]">
                                Kelola Usaha Mitra Lebih Mudah
                            </h1>
                            <p className="mt-2 text-sm text-[#184D47]/60">{MOBILE_SUMMARY}</p>
                        </div>

                        <Link
                            href="/"
                            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#184D47]/70 transition hover:text-[#184D47]"
                        >
                            <ArrowLeft size={16} /> Kembali ke AFA STORE
                        </Link>

                        <div className="mt-6 rounded-3xl border border-white/70 bg-white/80 p-6 shadow-[0_24px_60px_rgba(18,53,36,0.12)] backdrop-blur sm:p-8">
                            <h2 className="text-2xl font-black text-[#184D47]">Masuk AFA MITRA</h2>
                            <p className="mt-1 text-sm text-[#184D47]/60">
                                Masuk menggunakan akun AFA MITRA Anda.
                            </p>

                            <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
                                <label className="block text-sm font-bold text-[#184D47]">
                                    Username / Email
                                    <span className="relative mt-2 block">
                                        <Mail
                                            size={17}
                                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#184D47]/40"
                                        />
                                        <input
                                            name="identifier"
                                            type="text"
                                            autoComplete="username"
                                            value={identifier}
                                            onChange={(e) => setIdentifier(e.target.value)}
                                            className="w-full rounded-2xl border border-[#184D47]/15 bg-white/90 py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-[#C9A45B]"
                                            placeholder="username atau nama@email.com"
                                        />
                                    </span>
                                </label>

                                <label className="block text-sm font-bold text-[#184D47]">
                                    Password
                                    <span className="relative mt-2 block">
                                        <Lock
                                            size={17}
                                            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#184D47]/40"
                                        />
                                        <input
                                            name="password"
                                            type={showPassword ? "text" : "password"}
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className="w-full rounded-2xl border border-[#184D47]/15 bg-white/90 py-3 pl-10 pr-11 outline-none focus:ring-2 focus:ring-[#C9A45B]"
                                            placeholder="••••••••"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#184D47]/45 transition hover:text-[#184D47]"
                                        >
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                        </button>
                                    </span>
                                </label>

                                <div className="flex items-center justify-between text-sm">
                                    <label className="flex cursor-pointer items-center gap-2 font-semibold text-[#184D47]/75">
                                        <input
                                            type="checkbox"
                                            checked={remember}
                                            onChange={(e) => setRemember(e.target.checked)}
                                            className="h-4 w-4 rounded accent-[#184D47]"
                                        />
                                        Ingat Saya
                                    </label>
                                    <Link href="/forgot-password" className="font-bold text-[#184D47] hover:underline">
                                        Lupa Password
                                    </Link>
                                </div>

                                {error ? (
                                    <div
                                        role="alert"
                                        className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
                                    >
                                        {error}
                                    </div>
                                ) : null}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    aria-busy={loading}
                                    className={`${MITRA_PRIMARY_BTN} mt-1 w-full`}
                                >
                                    {loading ? <Loader2 className="animate-spin" size={18} /> : null}
                                    {loading ? "Memproses..." : "Masuk ke AFA MITRA"}
                                </button>
                            </form>
                        </div>

                        {/* Register account */}
                        <p className="mt-6 text-center text-sm text-[#184D47]/70">
                            Belum punya akun AFA MITRA?{" "}
                            <Link href="/mitra/daftar" className="font-bold text-[#184D47] hover:underline">
                                Daftar Akun Mitra
                            </Link>
                        </p>

                        {/* Become a partner */}
                        <div className="mt-6 rounded-2xl border border-dashed border-[#C9A45B]/50 bg-white/50 p-4 text-center">
                            <p className="text-sm font-bold text-[#184D47]">Belum menjadi Mitra?</p>
                            <p className="mt-1 text-xs text-[#184D47]/60">
                                Daftarkan usaha Anda dan kelola stok, kasir, serta laporan bersama AFA STORE.
                            </p>
                            <Link href="/mitra/daftar" className={`${MITRA_GOLD_BTN} mt-4 w-full`}>
                                Daftar Jadi Mitra
                            </Link>
                        </div>

                        {helpHref ? (
                            <p className="mt-5 text-center text-xs text-[#184D47]/55">
                                Butuh bantuan?{" "}
                                <a href={helpHref} target="_blank" rel="noopener noreferrer" className="font-bold text-[#184D47] hover:underline">
                                    Hubungi AFA STORE
                                </a>
                            </p>
                        ) : null}
                    </div>
                </section>
            </div>
        </main>
    );
}

function LoginBenefitList() {
    return (
        <ul className="mt-8 grid max-w-md grid-cols-2 gap-3">
            {BENEFITS.map((b) => (
                <li key={b.label} className="flex items-center gap-2.5 text-sm font-semibold text-[#F8F5EE]/90">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#C9A45B]/20 text-[#C9A45B]">
                        <b.icon size={16} />
                    </span>
                    {b.label}
                </li>
            ))}
        </ul>
    );
}

