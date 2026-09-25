"use client";

// ---------------------------------------------------------------------------
// PENGATURAN KASIR — presentation + device preferences only.
//
// Everything here REUSES existing systems:
//   - printer      : src/lib/thermal-printer/thermal-print-service.ts (BLE engine)
//   - paper widths : PAPER_WIDTHS / getPrinterProfile (58 | 80)
//   - theme        : useTheme() from the global ThemeProvider (afa-theme / data-theme)
//   - payments     : PAYMENT_METHODS from kasir-shared (display only)
//   - logout       : the same POST /api/auth/logout form as the sidebar
//
// No Order is created, no stock is touched and nothing is sent to any API. The
// only persisted value is the paper-width UI preference (localStorage) — the
// Bluetooth connection itself stays in memory exactly like KasirPrinterPanel.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    Bluetooth,
    BluetoothOff,
    Check,
    CircleDot,
    CreditCard,
    Download,
    Globe,
    Info,
    Loader2,
    LogOut,
    MonitorSmartphone,
    Moon,
    Phone,
    Printer,
    QrCode,
    Receipt,
    ShieldCheck,
    Sun,
    Unplug,
    UserRound,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import {
    disconnectBluetoothPrinter,
    getPrinterProfile,
    isBluetoothSupported,
    PAPER_WIDTHS,
    pickAndConnect,
    printReceiptBluetooth,
    type BluetoothConnection,
    type ReceiptData,
    type ThermalPaperWidth,
} from "@/lib/thermal-printer/thermal-print-service";
import { PAYMENT_METHODS } from "@/components/admin/kasir/kasir-shared";
import KasirInstallPrompt from "@/components/kasir/KasirInstallPrompt";
import { KASIR_APP_NAME } from "@/lib/kasir-pwa";

// Same default as KasirPrinterPanel (DEFAULT_PAPER_WIDTH = 58). Only the UI
// preference is persisted; the key is scoped to the kasir device.
const DEFAULT_PAPER_WIDTH: ThermalPaperWidth = 58;
const PAPER_WIDTH_STORAGE_KEY = "afa_kasir_paper_width";

// Store identity as printed by the existing receipt (KasirReceipt / KasirPrinterPanel).
const STORE = {
    name: "AFA STORE",
    whatsapp: "087770000883",
    website: "afastore.online",
};

type CashierIdentity = { name: string; email?: string | null };

function readStoredPaperWidth(): ThermalPaperWidth {
    try {
        const raw = window.localStorage.getItem(PAPER_WIDTH_STORAGE_KEY);
        const parsed = Number(raw);
        return (PAPER_WIDTHS as number[]).includes(parsed) ? (parsed as ThermalPaperWidth) : DEFAULT_PAPER_WIDTH;
    } catch {
        return DEFAULT_PAPER_WIDTH;
    }
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "K";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Coarse browser family only (no fingerprinting: no version, OS, screen or plugin data). */
function browserFamily(): string {
    if (typeof navigator === "undefined") return "-";
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return "Microsoft Edge";
    if (/OPR\//.test(ua)) return "Opera";
    if (/SamsungBrowser\//.test(ua)) return "Samsung Internet";
    if (/Chrome\//.test(ua)) return "Chrome";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Safari\//.test(ua)) return "Safari";
    return "Browser";
}

/** Test slip built on the SAME ESC/POS engine as the real receipt: no items, no totals, no Order. */
function buildTestReceipt(cashierName: string, width: ThermalPaperWidth): ReceiptData {
    const profile = getPrinterProfile(width);
    return {
        storeName: "AFA_STORE",
        invoice: "TEST-PRINTER",
        date: new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
        customer: "TEST PRINTER",
        cashier: cashierName || null,
        items: [],
        subtotalLabel: "-",
        totalLabel: "-",
        paymentMethod: "-",
        paymentStatus: "Uji cetak",
        footer: ["Printer berhasil terhubung", `Kertas ${profile.paperWidthMm} mm`, STORE.website, STORE.whatsapp],
        storeAddress: [`WA ${STORE.whatsapp}`, STORE.website],
    };
}

export default function KasirSettings({ cashier }: { cashier: CashierIdentity }) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [bluetoothOk, setBluetoothOk] = useState(false);
    const [browser, setBrowser] = useState("-");
    const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(DEFAULT_PAPER_WIDTH);
    const [connection, setConnection] = useState<BluetoothConnection | null>(null);
    const [busy, setBusy] = useState<"connect" | "print" | null>(null);
    const [message, setMessage] = useState<{ tone: "ok" | "warn" | "info"; text: string } | null>(null);

    // Feature detection + stored preference run only on the client after mount.
    useEffect(() => {
        setMounted(true);
        setBluetoothOk(isBluetoothSupported());
        setBrowser(browserFamily());
        setPaperWidth(readStoredPaperWidth());
    }, []);

    // Mirror KasirPrinterPanel: drop the runtime connection when the printer goes away.
    useEffect(() => {
        if (!connection) return undefined;
        const onDisconnect = () => {
            setConnection(null);
            setMessage({ tone: "warn", text: "Printer terputus." });
        };
        connection.device.addEventListener("gattserverdisconnected", onDisconnect);
        return () => connection.device.removeEventListener("gattserverdisconnected", onDisconnect);
    }, [connection]);

    const connected = Boolean(connection && connection.device.gatt?.connected);
    const printerName = connection?.device.name?.trim() || "Printer Bluetooth";
    const dark = mounted && theme === "dark";

    const choosePaper = useCallback((width: ThermalPaperWidth) => {
        setPaperWidth(width);
        try {
            window.localStorage.setItem(PAPER_WIDTH_STORAGE_KEY, String(width));
        } catch {
            // Preference still applies for this session when storage is unavailable.
        }
    }, []);

    const handleConnect = useCallback(async () => {
        if (busy) return;
        setBusy("connect");
        setMessage(null);
        try {
            const result = await pickAndConnect();
            if (result.connection) {
                setConnection(result.connection);
                setMessage({ tone: "ok", text: result.message });
            } else {
                setMessage({ tone: result.canceled ? "info" : "warn", text: result.message });
            }
        } finally {
            setBusy(null);
        }
    }, [busy]);

    const handleDisconnect = useCallback(() => {
        if (connection) disconnectBluetoothPrinter(connection.device);
        setConnection(null);
        setMessage({ tone: "info", text: "Printer diputuskan." });
    }, [connection]);

    const handleTestPrint = useCallback(async () => {
        if (busy || !connection) return;
        setBusy("print");
        setMessage(null);
        try {
            const outcome = await printReceiptBluetooth(connection, buildTestReceipt(cashier.name, paperWidth), paperWidth);
            setMessage({ tone: outcome.ok ? "ok" : "warn", text: outcome.ok ? "Test print terkirim ke printer." : outcome.message });
        } finally {
            setBusy(null);
        }
    }, [busy, cashier.name, connection, paperWidth]);

    const printerStatus = useMemo(() => {
        if (!mounted) return { label: "Memeriksa…", tone: "muted" as const };
        if (connected) return { label: `Terhubung • ${printerName}`, tone: "ok" as const };
        if (!bluetoothOk) return { label: "Bluetooth tidak tersedia di browser ini", tone: "warn" as const };
        return { label: "Belum terhubung", tone: "muted" as const };
    }, [bluetoothOk, connected, mounted, printerName]);

    return (
        <section className="kasir-settings">
            {/* HEADER */}
            <header className="kasir-settings-header">
                <div>
                    <p className="kasir-settings-kicker">Pengaturan</p>
                    <h1>Pengaturan Kasir</h1>
                    <p className="kasir-settings-sub">Kelola perangkat, struk, pembayaran, dan tampilan kasir.</p>
                </div>
                <span className="kasir-settings-pill kasir-settings-pill-ok" role="status">
                    <CircleDot size={12} aria-hidden="true" />
                    Kasir Aktif
                </span>
            </header>

            <div className="kasir-settings-grid">
                {/* PROFIL KASIR */}
                <article className="kasir-settings-card">
                    <CardTitle icon={UserRound} title="Profil Kasir" />
                    <div className="kasir-settings-profile">
                        <span className="kasir-settings-avatar" aria-hidden="true">{initials(cashier.name)}</span>
                        <div className="min-w-0">
                            <p className="kasir-settings-name">{cashier.name}</p>
                            <p className="kasir-settings-muted">Kasir aktif</p>
                            {cashier.email ? <p className="kasir-settings-muted truncate">{cashier.email}</p> : null}
                        </div>
                    </div>
                    <StatusRow label="Status" value="Aktif" tone="ok" />
                    <p className="kasir-settings-note">Akun kasir dikelola oleh Admin melalui menu Akun Kasir.</p>
                </article>

                {/* PRINTER & STRUK */}
                <article className="kasir-settings-card kasir-settings-card-printer">
                    <CardTitle icon={Printer} title="Printer & Struk" />

                    <p className="kasir-settings-label">Printer Thermal</p>
                    <div className="kasir-settings-status" data-tone={printerStatus.tone}>
                        {connected ? <Bluetooth size={16} aria-hidden="true" /> : <BluetoothOff size={16} aria-hidden="true" />}
                        <span>{printerStatus.label}</span>
                    </div>

                    <div className="kasir-settings-actions">
                        {!connected ? (
                            <button
                                type="button"
                                onClick={() => void handleConnect()}
                                disabled={!mounted || !bluetoothOk || busy !== null}
                                className="kasir-settings-btn kasir-settings-btn-primary"
                            >
                                {busy === "connect" ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Bluetooth size={18} aria-hidden="true" />}
                                Hubungkan Printer
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => void handleTestPrint()}
                                    disabled={busy !== null}
                                    className="kasir-settings-btn kasir-settings-btn-primary"
                                >
                                    {busy === "print" ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Receipt size={18} aria-hidden="true" />}
                                    Test Print
                                </button>
                                <button type="button" onClick={handleDisconnect} disabled={busy !== null} className="kasir-settings-btn">
                                    <Unplug size={18} aria-hidden="true" />
                                    Putuskan
                                </button>
                            </>
                        )}
                    </div>
                    {mounted && !bluetoothOk ? (
                        <p className="kasir-settings-note">Gunakan Chrome / Edge di Android atau desktop untuk mencetak lewat Bluetooth.</p>
                    ) : null}
                    {message ? (
                        <p className="kasir-settings-message" data-tone={message.tone} role="status">{message.text}</p>
                    ) : null}

                    <p className="kasir-settings-label mt-5">Ukuran Kertas</p>
                    <div className="kasir-settings-paper" role="group" aria-label="Ukuran kertas struk">
                        {PAPER_WIDTHS.map((width) => {
                            const active = paperWidth === width;
                            return (
                                <button
                                    key={width}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => choosePaper(width)}
                                    className={`kasir-settings-choice${active ? " is-active" : ""}`}
                                >
                                    {active ? <Check size={16} aria-hidden="true" /> : null}
                                    {width} mm
                                </button>
                            );
                        })}
                    </div>
                    <p className="kasir-settings-note">{getPrinterProfile(paperWidth).charactersPerLine} karakter per baris • Test print memakai ukuran ini.</p>
                </article>

                {/* METODE PEMBAYARAN */}
                <article className="kasir-settings-card">
                    <CardTitle icon={CreditCard} title="Metode Pembayaran" />
                    <ul className="kasir-settings-list">
                        {PAYMENT_METHODS.map((method) => (
                            <li key={method.id}>
                                <span className="kasir-settings-check" aria-hidden="true"><Check size={14} /></span>
                                <span>{method.label}</span>
                                <span className="kasir-settings-muted">Didukung</span>
                            </li>
                        ))}
                    </ul>
                    <div className="kasir-settings-qris">
                        <QrCode size={18} aria-hidden="true" />
                        <div>
                            <p className="font-black">QRIS AFA STORE</p>
                            <p className="kasir-settings-muted">Tersedia • QRIS statis merchant, konfirmasi manual oleh kasir.</p>
                        </div>
                    </div>
                </article>

                {/* TAMPILAN */}
                <article className="kasir-settings-card">
                    <CardTitle icon={dark ? Moon : Sun} title="Tampilan" />
                    <p className="kasir-settings-label">Tema</p>
                    <div className="kasir-settings-paper" role="group" aria-label="Tema tampilan kasir">
                        <button
                            type="button"
                            aria-pressed={mounted && !dark}
                            onClick={() => setTheme("light")}
                            className={`kasir-settings-choice${mounted && !dark ? " is-active" : ""}`}
                        >
                            <Sun size={16} aria-hidden="true" />
                            Light
                        </button>
                        <button
                            type="button"
                            aria-pressed={dark}
                            onClick={() => setTheme("dark")}
                            className={`kasir-settings-choice${dark ? " is-active" : ""}`}
                        >
                            <Moon size={16} aria-hidden="true" />
                            Night
                        </button>
                    </div>
                    <p className="kasir-settings-note">Mode Night nyaman untuk perangkat kasir di ruangan redup. Struk dan QRIS tetap tampil asli.</p>
                </article>

                {/* PERANGKAT */}
                <article className="kasir-settings-card">
                    <CardTitle icon={MonitorSmartphone} title="Perangkat" />
                    <dl className="kasir-settings-dl">
                        <div><dt>Browser</dt><dd>{mounted ? browser : "-"}</dd></div>
                        <div><dt>Bluetooth</dt><dd>{mounted ? (bluetoothOk ? "Tersedia" : "Tidak tersedia") : "-"}</dd></div>
                        <div><dt>Printer</dt><dd>{connected ? printerName : "Belum terhubung"}</dd></div>
                        <div><dt>Kertas</dt><dd>{paperWidth} mm</dd></div>
                        <div><dt>Mode Tampilan</dt><dd>{mounted ? (dark ? "Night" : "Light") : "-"}</dd></div>
                    </dl>
                </article>

                {/* APLIKASI KASIR (PWA install) */}
                <article className="kasir-settings-card">
                    <CardTitle icon={Download} title="Aplikasi Kasir" />
                    <p className="kasir-settings-label">Pasang di Perangkat</p>
                    <KasirInstallPrompt />
                </article>

                {/* STATUS SISTEM */}
                <article className="kasir-settings-card">
                    <CardTitle icon={Info} title="Status Sistem" />
                    <StatusRow label="Kasir" value="Aktif" tone="ok" />
                    <StatusRow label="Printer" value={connected ? "Terhubung" : "Belum terhubung"} tone={connected ? "ok" : "muted"} />
                    <StatusRow label="QRIS" value="Tersedia" tone="ok" />
                    <StatusRow label="Aplikasi" value={KASIR_APP_NAME} tone="plain" />
                </article>

                {/* STRUK & TOKO */}
                <article className="kasir-settings-card kasir-settings-card-wide">
                    <CardTitle icon={Receipt} title="Struk AFA STORE" />
                    <div className="kasir-settings-store">
                        <p className="kasir-settings-store-name">{STORE.name}</p>
                        <p><Phone size={15} aria-hidden="true" />WA {STORE.whatsapp}</p>
                        <p><Globe size={15} aria-hidden="true" />{STORE.website}</p>
                    </div>
                    <p className="kasir-settings-note">Identitas ini tercetak di kepala setiap struk kasir.</p>
                </article>

                {/* AKUN & KEAMANAN */}
                <article className="kasir-settings-card kasir-settings-card-wide">
                    <CardTitle icon={ShieldCheck} title="Akun & Keamanan" />
                    <div className="kasir-settings-security">
                        <p className="kasir-settings-muted">Keluar dari perangkat kasir ini. Sesi kasir akan ditutup dengan aman.</p>
                        <form action="/api/auth/logout" method="post">
                            <button type="submit" className="kasir-settings-btn kasir-settings-btn-danger">
                                <LogOut size={18} aria-hidden="true" />
                                Keluar dari Kasir
                            </button>
                        </form>
                    </div>
                    <Link href="/kasir" className="kasir-settings-link">Kembali ke Transaksi</Link>
                </article>
            </div>
        </section>
    );
}

function CardTitle({ icon: Icon, title }: { icon: typeof Printer; title: string }) {
    return (
        <h2 className="kasir-settings-title">
            <span className="kasir-settings-title-icon" aria-hidden="true"><Icon size={17} /></span>
            {title}
        </h2>
    );
}

function StatusRow({ label, value, tone }: { label: string; value: string; tone: "ok" | "muted" | "plain" }) {
    return (
        <div className="kasir-settings-row">
            <span className="kasir-settings-muted">{label}</span>
            <span className="kasir-settings-row-value" data-tone={tone}>
                {tone !== "plain" ? <CircleDot size={11} aria-hidden="true" /> : null}
                {value}
            </span>
        </div>
    );
}
