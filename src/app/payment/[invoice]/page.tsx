import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PaymentProofForm } from "@/components/payment/payment-proof-form";
import { syncOrderPaymentByInvoice } from "@/lib/payments";

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
    const synced = await syncOrderPaymentByInvoice(invoice);
    const order = synced?.order ?? (await prisma.order.findUnique({ where: { invoice } }));
    if (!order) notFound();

    const payment = synced?.payment ?? (await prisma.payment.findUnique({ where: { orderId: order.id } }));
    const method = payment?.method || order.paymentMethod;
    const status = payment?.status || order.paymentStatus;
    const rawResponse = getRawResponse(payment?.rawResponse);
    const actions = rawResponse.actions;
    const actionQrUrl = actions?.find((action) => action.name === "generate-qr-code")?.url;
    const storedQrUrl = payment?.qrisUrl || actionQrUrl || "";
    const qrisSrc = storedQrUrl;

    console.log("Payment record:", payment);
    console.log({
        qrisSrc,
        actions,
    });

    return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(201,164,91,0.16),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(18,53,36,0.12),transparent_30%),linear-gradient(135deg,#F8F5EE,#FFFDF8_55%,#EFE6D5)] px-4 py-6 text-[#2E2A26] md:px-6 md:py-8"><div className="mx-auto max-w-6xl"><div className="rounded-[30px] border border-white/70 bg-white/70 p-5 shadow-[0_24px_70px_rgba(18,53,36,0.10)] backdrop-blur md:p-8"><div className="flex flex-col gap-3 text-center"><p className="text-sm font-bold uppercase tracking-[0.22em] text-[#C9A45B]">Pembayaran Pesanan</p><h1 className="font-display text-4xl font-bold text-[#123524] md:text-5xl">Selesaikan Pembayaran Anda</h1><p className="mx-auto max-w-2xl text-[#6D6558]">Invoice <b className="text-[#123524]">{order.invoice}</b> Pesanan Anda telah berhasil dibuat. Silakan selesaikan pembayaran sesuai nominal yang tertera menggunakan QRIS. Setelah pembayaran berhasil, pesanan akan diproses secara otomatis.</p></div><div className="mt-8"><PaymentProofForm invoice={order.invoice} total={order.total} paymentMethod={method} paymentStatus={status} qrisSrc={qrisSrc} expiredAt={payment?.expiredAt?.toISOString() ?? null} /></div><div className="mt-8 flex flex-wrap justify-center gap-3 text-sm font-semibold text-[#123524]"><span className="rounded-full bg-[#F8F5EE] px-4 py-2">1. Scan QRIS</span><span className="rounded-full bg-[#F8F5EE] px-4 py-2">2. Bayar Nominal Tepat</span><span className="rounded-full bg-[#F8F5EE] px-4 py-2">3. Status Otomatis Update</span></div><div className="mt-8 flex flex-wrap justify-center gap-3 text-center"><Link href="/orders" className="inline-flex rounded-full border border-[#C9A45B] px-6 py-3 font-bold text-[#123524] hover:bg-[#C9A45B]/10">Lihat Riwayat Order</Link><Link href="/account" className="inline-flex rounded-full bg-[#C9A45B] px-6 py-3 font-bold text-white shadow-[0_14px_32px_rgba(201,164,91,0.28)] hover:bg-[#A9853F]">Lihat Pesanan</Link></div></div></div></main>;
}
