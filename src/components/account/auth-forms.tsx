"use client";

import { useState } from "react";
import Link from "next/link";

type Mode = "login" | "register" | "forgot" | "reset";

export function AuthForm({ mode, token }: { mode: Mode; token?: string }) {
    const [form, setForm] = useState<Record<string, string>>({ token: token || "" });
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setMessage("");
        const endpoint = mode === "login" ? "/api/auth/login" : mode === "register" ? "/api/auth/register" : mode === "forgot" ? "/api/auth/forgot-password" : "/api/auth/reset-password";
        const payload = mode === "login" ? { identifier: form.identifier, password: form.password, remember: form.remember === "on" } : form;
        const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await response.json();
        setLoading(false);
        if (!response.ok) return setMessage(data.message || "Terjadi kesalahan.");
        if (mode === "login" || mode === "register") window.location.href = "/account";
        setMessage(data.resetUrl || data.message || "Berhasil.");
    };

    const input = (name: string, label: string, type = "text") => <label className="block text-sm font-bold">{label}<input name={name} type={type} value={form[name] || ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} className="mt-2 w-full rounded-2xl border border-[#184C3A]/15 bg-white/80 px-4 py-3 outline-none focus:ring-2 focus:ring-[#D4AF37]" /></label>;

    return <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7df,#f7ead0_45%,#ffffff)] px-4 py-12 text-[#102116]"><form onSubmit={submit} className="mx-auto max-w-xl rounded-4xl border border-white/70 bg-white/70 p-6 shadow-2xl backdrop-blur md:p-10"><Link href="/" className="text-sm font-bold text-[#184C3A]">← Kembali ke AFA STORE</Link><p className="mt-8 text-[#D4AF37]">MY ACCOUNT</p><h1 className="text-4xl font-bold text-[#184C3A]">{mode === "login" ? "Masuk" : mode === "register" ? "Daftar Akun" : mode === "forgot" ? "Lupa Password" : "Reset Password"}</h1><div className="mt-8 grid gap-4">{mode === "register" && <>{input("name", "Nama Lengkap")}{input("email", "Email", "email")}{input("phone", "Nomor WhatsApp")}</>}{mode === "login" && input("identifier", "Email atau Nomor WhatsApp")}{mode === "forgot" && input("email", "Email", "email")}{mode === "reset" && <>{input("token", "Token Reset")}</>}{mode !== "forgot" && <>{input("password", "Password", "password")}{mode !== "login" && input("confirmPassword", "Konfirmasi Password", "password")}</>}{mode === "login" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" onChange={(e) => setForm({ ...form, remember: e.target.checked ? "on" : "" })} /> Remember Me</label>}</div>{message && <p className="mt-5 rounded-2xl bg-[#184C3A]/10 p-4 text-sm font-bold text-[#184C3A] break-words">{message}</p>}<button disabled={loading} className="mt-6 w-full rounded-2xl bg-[#184C3A] px-6 py-4 font-bold text-white shadow-xl disabled:opacity-50">{loading ? "Memproses..." : "Lanjutkan"}</button><div className="mt-5 flex flex-wrap gap-4 text-sm font-bold text-[#184C3A]"><Link href="/login">Masuk</Link><Link href="/register">Daftar</Link><Link href="/forgot-password">Lupa Password</Link></div></form></main>;
}