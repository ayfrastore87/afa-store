"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Swal from "sweetalert2";

import { parseJsonResponse } from "@/lib/api-fetch";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "register" | "forgot" | "reset";

const LOGIN_TIMEOUT_MS = 15000;

type AuthApiResponse = {
    message?: string;
};

function getErrorMessage(error: unknown, fallback: string) {
    if (error instanceof DOMException && error.name === "AbortError") {
        return "Login terlalu lama. Periksa koneksi internet lalu coba lagi.";
    }

    if (error instanceof Error) {
        return error.message || fallback;
    }

    return fallback;
}

export function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
    const router = useRouter();
    const [form, setForm] = useState<Record<string, string>>({ token: token || "" });
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [resetReady, setResetReady] = useState(mode !== "reset");

    useEffect(() => {
        if (mode !== "reset") return;

        const params = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token") || params.get("access_token");
        const refreshToken = hashParams.get("refresh_token") || params.get("refresh_token");

        if (!accessToken || !refreshToken) {
            setError("Link reset password tidak valid atau sudah kedaluwarsa.");
            setResetReady(false);
            return;
        }

        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error: sessionError }) => {
            if (sessionError) {
                console.error("Supabase reset password session error:", sessionError);
                setError(sessionError.message);
                setResetReady(false);
                return;
            }

            setResetReady(true);
        });
    }, [mode]);

    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const getResetRedirectUrl = () => `${window.location.origin}/reset-password`;

    const showToast = (title: string, icon: "success" | "error" = "success") => {
        void Swal.fire({ toast: true, position: "top-end", timer: 2600, showConfirmButton: false, icon, title });
    };

    const getRegisterErrorMessage = (rawMessage: string) => {
        if (/email rate limit exceeded/i.test(rawMessage)) {
            return "Terlalu banyak email verifikasi yang dikirim dalam waktu singkat. Silakan tunggu beberapa saat lalu coba lagi.";
        }

        if (/already|registered|exists/i.test(rawMessage)) {
            return "Email sudah digunakan.";
        }

        return rawMessage || "Terjadi kesalahan saat mendaftar.";
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setMessage("");
        setError("");

        if (mode === "forgot") {
            const email = form.email?.trim() || "";
            if (!email) {
                setLoading(false);
                setError("Email wajib diisi.");
                return;
            }
            if (!isValidEmail(email)) {
                setLoading(false);
                setError("Format email tidak valid.");
                return;
            }

            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: getResetRedirectUrl() });
            setLoading(false);
            if (resetError) {
                console.error("Supabase forgot password error:", resetError);
                setError(resetError.message);
                showToast(resetError.message, "error");
                return;
            }

            const successMessage = "Silakan cek email Anda untuk melakukan reset password.";
            setMessage(successMessage);
            showToast(successMessage);
            return;
        }

        if (mode === "reset") {
            if (!resetReady) {
                setLoading(false);
                setError("Link reset password tidak valid atau sudah kedaluwarsa.");
                return;
            }
            if (!form.password) {
                setLoading(false);
                setError("Password baru wajib diisi.");
                return;
            }
            if (form.password.length < 6) {
                setLoading(false);
                setError("Password minimal 6 karakter.");
                return;
            }
            if (form.password !== form.confirmPassword) {
                setLoading(false);
                setError("Konfirmasi password tidak sama.");
                return;
            }

            const { error: updateError } = await supabase.auth.updateUser({ password: form.password });
            setLoading(false);
            if (updateError) {
                console.error("Supabase reset password update error:", updateError);
                setError(updateError.message);
                showToast(updateError.message, "error");
                return;
            }

            showToast("Password berhasil diperbarui. Silakan login.");
            router.push("/login");
            return;
        }

        const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
        const payload = mode === "login" ? { identifier: form.identifier, password: form.password, remember: form.remember === "on" } : form;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
        let response: Response;
        let data: AuthApiResponse = {};

        try {
            if (mode === "login") {
                console.log("Login request started");
            }

            response = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            if (mode === "login") {
                console.log("Login response received", { ok: response.ok, status: response.status });
            }

            data = await parseJsonResponse<AuthApiResponse>(response);
        } catch (error) {
            const errorMessage = getErrorMessage(error, "Server tidak merespons.");
            console.error("Login request failed", error);
            setLoading(false);
            setError(errorMessage);
            showToast(errorMessage, "error");
            return;
        } finally {
            window.clearTimeout(timeoutId);
        }

        setLoading(false);
        if (!response.ok) {
            const errorMessage = mode === "register" ? getRegisterErrorMessage(data.message || "") : data.message || "Terjadi kesalahan.";
            if (mode === "login") {
                console.error("Login failed", { status: response.status, message: errorMessage });
            } else {
                console.error("Supabase register error:", data.message || errorMessage);
            }
            setError(errorMessage);
            showToast(errorMessage, "error");
            return;
        }

        const successMessage = data.message || (mode === "register" ? "Registrasi berhasil. Cek email verifikasi Anda." : "Login berhasil.");
        setMessage(successMessage);
        showToast(successMessage);
        if (mode === "login" && response.ok) router.push("/account");
    };

    const input = (name: string, label: string, type = "text") => <label className="block text-sm font-bold">{label}<input name={name} type={type} value={form[name] || ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} className="mt-2 w-full rounded-2xl border border-[#184C3A]/15 bg-white/80 px-4 py-3 outline-none focus:ring-2 focus:ring-[#D4AF37]" /></label>;

    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7df,#f7ead0_45%,#ffffff)] px-4 py-12 text-[#102116]"><form onSubmit={submit} className="mx-auto max-w-xl rounded-4xl border border-white/70 bg-white/70 p-6 shadow-2xl backdrop-blur md:p-10"><Link href="/" className="text-sm font-bold text-[#184C3A]">← Kembali ke AFA STORE</Link><p className="mt-8 text-[#D4AF37]">MY ACCOUNT</p><h1 className="text-4xl font-bold text-[#184C3A]">{mode === "login" ? "Masuk" : mode === "register" ? "Daftar Akun" : mode === "forgot" ? "Lupa Password" : "Reset Password"}</h1><div className="mt-8 grid gap-4">{mode === "register" && <>{input("name", "Nama Lengkap")}{input("email", "Email", "email")}{input("phone", "Nomor WhatsApp")}</>}{mode === "login" && input("identifier", "Email atau Nomor WhatsApp")}{mode === "forgot" && input("email", "Email", "email")}{mode !== "forgot" && <>{input("password", mode === "reset" ? "Password Baru" : "Password", "password")}{mode !== "login" && input("confirmPassword", "Konfirmasi Password", "password")}</>}{mode === "login" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" onChange={(e) => setForm({ ...form, remember: e.target.checked ? "on" : "" })} /> Remember Me</label>}</div>{message && <p className="mt-5 rounded-2xl bg-[#184C3A]/10 p-4 text-sm font-bold text-[#184C3A] wrap-break-word">{message}</p>}{error && <p className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 wrap-break-word">{error}</p>}<button disabled={loading || (mode === "reset" && !resetReady)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#184C3A] px-6 py-4 font-bold text-white shadow-xl transition disabled:cursor-not-allowed disabled:opacity-50">{loading && <Loader2 className="animate-spin" size={18} />}{loading ? "Memproses..." : "Lanjutkan"}</button><div className="mt-5 flex flex-wrap gap-4 text-sm font-bold text-[#184C3A]"><Link href="/login">Masuk</Link><Link href="/register">Daftar</Link><Link href="/forgot-password">Lupa Password</Link></div></form></main>;
}