import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PaymentProofForm } from "@/components/payment/payment-proof-form";
import { getCurrentUser } from "@/lib/server-auth";

type MidtransAction = { name?: string; method?: string; url?: string };

type MidtransRawResponse = {
    actions?: MidtransAction[];
    qr_string?: string;
    qrString?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRawResponse(value: unknown): MidtransRawResponse {
    if (!isRecord(value)) return {};
    const actions = Array.isArray(value.actions) ? value.actions.filter(isRecord).map((action) => ({
        name: typeof action.name === "string" ? action.name : undefined,
        method: typeof action.method === "string" ? action.method : undefined,
        url: typeof action.url === "string" ? action.url : undefined,
    })) : undefined;

    return {
        actions,
        qr_string: typeof value.qr_string === "string" ? value.qr_string : undefined,
        qrString: typeof value.qrString === "string" ? value.qrString : undefined,
    };
}

export default async function PaymentPage({ params }: { params: Promise<{ invoice: string }> }) {
    const { invoice } = await params;
    const user = await getCurrentUser();
    if (!user) notFound();
    const order = await prisma.order.findFirst({ where: { invoice, userId: user.id } });
    if (!order) notFound();
    const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    const method = payment?.method || order.paymentMethod;
    const status = payment?.status || order.paymentStatus;
    const rawResponse = getRawResponse(payment?.rawResponse);
    const actions = rawResponse.actions;
    const actionQrUrl = actions?.find((action) => action.name === "generate-qr-code")?.url;
    const storedQrUrl = payment?.qrisUrl || actionQrUrl || "";
    const qrisSrc = storedQrUrl;

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(201,164,91,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(18,53,36,0.12),transparent_30%),linear-gradient(135deg,#F8F5EE,#FFFDF8_55%,#EFE6D5)] px-4 py-5 text-[#2E2A26] md:px-6 md:py-8">
            <div className="mx-auto max-w-3xl">
                <header className="flex items-center justify-between gap-3">
                    <Link href="/" className="flex items-center gap-2.5" aria-label="AFA FOOD Cilegon - Beranda">
                        <Image src="/AFA LOGO.svg" alt="AFA FOOD CILEGON" width={40} height={56} className="h-12 w-9 shrink-0 object-contain" />
                        <span className="leading-tight">
                            <span className="block font-display text-lg font-bold text-[#123524]">AFA FOOD</span>
                            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-[#C9A45B]">Cilegon</span>
                        </span>
                    </Link>
                    <Link href="/" className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#C9A45B]/30 bg-white/70 px-3.5 py-2 text-xs font-bold text-[#123524] shadow-sm transition hover:bg-[#C9A45B]/10">
                        <ArrowLeft size={14} /> Kembali ke Beranda
                    </Link>
                </header>

                <div className="mt-7">
                    <PaymentProofForm
                        invoice={order.invoice}
                        total={order.total}
                        paymentMethod={method}
                        paymentStatus={status}
                        qrisSrc={qrisSrc}
                        expiredAt={payment?.expiredAt?.toISOString() ?? null}
                    />
                </div>
            </div>
        </main>
    );
}
