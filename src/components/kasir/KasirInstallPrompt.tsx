"use client";

// ---------------------------------------------------------------------------
// INSTALL AFA KASIR — "Aplikasi Kasir" card on /kasir/pengaturan.
//
// Presentation only. It talks to exactly two browser APIs:
//   - `beforeinstallprompt` (Chrome / Edge / Samsung Internet) to offer the
//     native install sheet from our own button, and
//   - `matchMedia("(display-mode: standalone)")` / `appinstalled` to know when
//     the kasir is already running as an installed app.
//
// Browsers without `beforeinstallprompt` (iOS Safari, Firefox) get a short
// manual "Add to Home Screen" hint instead. No service worker, no storage, no
// network, no popups, nothing touches the POS logic, auth or the printer.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, Smartphone } from "lucide-react";
import { KASIR_APP_NAME } from "@/lib/kasir-pwa";

/** Non-standard Chromium event; not in lib.dom, so typed locally. */
type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallState = "checking" | "installed" | "ready" | "unsupported";

function isStandaloneDisplay(): boolean {
    if (typeof window === "undefined") return false;
    // iOS Safari exposes `navigator.standalone`; everyone else the display-mode media query.
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

function isIosDevice(): boolean {
    if (typeof navigator === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function KasirInstallPrompt() {
    const [state, setState] = useState<InstallState>("checking");
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [busy, setBusy] = useState(false);
    const [ios, setIos] = useState(false);
    const [message, setMessage] = useState<{ tone: "ok" | "info" | "warn"; text: string } | null>(null);

    useEffect(() => {
        setIos(isIosDevice());
        if (isStandaloneDisplay()) {
            setState("installed");
            return undefined;
        }

        const onBeforeInstall = (event: Event) => {
            // Keep the native mini-infobar away; we offer install from our own button.
            event.preventDefault();
            setDeferred(event as BeforeInstallPromptEvent);
            setState("ready");
        };
        const onInstalled = () => {
            setDeferred(null);
            setState("installed");
            setMessage({ tone: "ok", text: `${KASIR_APP_NAME} berhasil dipasang. Buka dari layar utama perangkat.` });
        };

        window.addEventListener("beforeinstallprompt", onBeforeInstall);
        window.addEventListener("appinstalled", onInstalled);

        // Chrome fires `beforeinstallprompt` shortly after load once the manifest is
        // valid. If it never arrives (already installed elsewhere, unsupported
        // browser, or criteria not met) fall back to the manual instructions.
        const fallback = window.setTimeout(() => {
            setState((current) => (current === "checking" ? "unsupported" : current));
        }, 2500);

        return () => {
            window.clearTimeout(fallback);
            window.removeEventListener("beforeinstallprompt", onBeforeInstall);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const handleInstall = useCallback(async () => {
        if (!deferred || busy) return;
        setBusy(true);
        setMessage(null);
        try {
            await deferred.prompt();
            const { outcome } = await deferred.userChoice;
            if (outcome === "accepted") {
                setMessage({ tone: "ok", text: "Pemasangan dimulai. Ikon AFA KASIR akan muncul di layar utama." });
            } else {
                setMessage({ tone: "info", text: "Pemasangan dibatalkan. Anda bisa mencoba lagi kapan saja." });
            }
        } catch {
            setMessage({ tone: "warn", text: "Browser menolak pemasangan. Gunakan menu browser: Install app / Tambahkan ke layar utama." });
        } finally {
            // A BeforeInstallPromptEvent can only be used once.
            setDeferred(null);
            setState((current) => (current === "installed" ? current : "unsupported"));
            setBusy(false);
        }
    }, [busy, deferred]);

    const statusLabel =
        state === "checking" ? "Memeriksa…" : state === "ready" ? "Siap dipasang di perangkat ini" : "Dibuka di browser";

    return (
        <>
            {state === "installed" ? (
                <div className="kasir-settings-status" data-tone="ok" role="status">
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span>Berjalan sebagai aplikasi terpasang</span>
                </div>
            ) : (
                <div className="kasir-settings-status" data-tone={state === "ready" ? "ok" : "muted"} role="status">
                    <Smartphone size={16} aria-hidden="true" />
                    <span>{statusLabel}</span>
                </div>
            )}

            {state === "ready" ? (
                <div className="kasir-settings-actions">
                    <button
                        type="button"
                        onClick={() => void handleInstall()}
                        disabled={busy}
                        className="kasir-settings-btn kasir-settings-btn-primary"
                    >
                        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Download size={18} aria-hidden="true" />}
                        Install AFA Kasir
                    </button>
                </div>
            ) : null}

            {state === "unsupported" ? (
                <p className="kasir-settings-note">
                    {ios
                        ? "Di iPhone/iPad: buka di Safari, ketuk tombol Bagikan, lalu pilih \u201cTambahkan ke Layar Utama\u201d."
                        : "Buka menu browser (\u22ee) lalu pilih \u201cInstall app\u201d atau \u201cTambahkan ke layar utama\u201d. Jika sudah terpasang, buka dari ikon AFA KASIR."}
                </p>
            ) : null}

            {message ? (
                <p className="kasir-settings-message" data-tone={message.tone} role="status">{message.text}</p>
            ) : null}

            <p className="kasir-settings-note">
                Aplikasi terpasang membuka kasir layar penuh tanpa bilah alamat, langsung ke halaman Transaksi. Login dan printer bekerja sama seperti di browser.
            </p>
        </>
    );
}
