import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentSalesPerson } from "@/lib/server-auth";
import SalesLoginForm from "@/components/sales/SalesLoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Masuk | AFA SALES",
    robots: { index: false, follow: false },
};

// PUBLIC page outside the `(protected)` route group, mirroring /kasir/login:
// an active sales person is sent ONCE to /sales; everyone else renders the
// form so the guard redirect can never bounce back here.
export default async function SalesLoginPage() {
    const sales = await getCurrentSalesPerson();
    if (sales) redirect("/sales");
    return (
        <main className="grid min-h-screen place-items-center bg-[#123524] p-5">
            <section className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-[#F8F5EE] shadow-2xl md:grid-cols-2">
                <div className="hidden items-center justify-center bg-[#184D47] p-12 md:flex">
                    <Image src="/AFA LOGO.svg" alt="AFA STORE" width={160} height={220} className="h-52 w-auto" priority />
                </div>
                <div className="p-7 md:p-12">
                    <p className="text-sm font-bold tracking-[.3em] text-[#C9A45B]">AFA STORE</p>
                    <h1 className="mt-2 text-4xl font-black text-[#123524]">SALES</h1>
                    <p className="mt-2 text-[#123524]/60">Titip Jual Lebih Mudah</p>
                    <SalesLoginForm />
                </div>
            </section>
        </main>
    );
}