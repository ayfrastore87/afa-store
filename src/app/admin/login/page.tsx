import Image from "next/image";
import { redirect } from "next/navigation";
import LoginForm from "@/components/admin/LoginForm";
import { getCurrentAdmin } from "@/lib/auth";

export default async function AdminLoginPage() {
    const admin = await getCurrentAdmin();
    if (admin) redirect("/admin");

    return (
        <main className="grid min-h-screen place-items-center bg-[#184D47] px-4 py-10 text-[#184D47]">
            <section className="relative z-10 w-full max-w-md">
                <div className="mb-7 text-center text-white">
                    <div className="mx-auto mb-4 grid h-32 w-28 place-items-center rounded-[28px] border border-[#C8A14A]/35 bg-white/95 p-2 shadow-2xl shadow-black/20">
                        <Image src="/AFA LOGO.svg" alt="AFA STORE logo" width={96} height={144} className="h-28 w-20 object-contain" priority />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-[0.38em] text-[#C8A14A]">AFA STORE</p>
                    <h1 className="mt-3 text-3xl font-black md:text-4xl">Admin Login</h1>
                    <p className="mt-2 text-sm text-white/70">Masuk ke premium control room AFA Store.</p>
                </div>

                <LoginForm />
            </section>
        </main>
    );
}