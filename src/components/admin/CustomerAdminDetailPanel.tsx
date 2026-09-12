"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Boxes, Handshake, Loader2, MapPin, MessageCircle, Store, User } from "lucide-react";

import { partnerStatusLabels } from "@/lib/partner";
import { whatsappLink } from "@/lib/whatsapp";

type PartnerInfo = {
    id: string;
    partnerCode: string;
    partnerType: string;
    status: string;
    displayName: string;
    businessName: string | null;
    phone: string | null;
    address: string | null;
    village: string | null;
    district: string | null;
    city: string | null;
    postalCode: string | null;
    createdAt: string;
};

type AddressInfo = {
    id: string;
    recipientName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    village: string;
    detail: string;
    isDefault: boolean;
};

type OrderRow = {
    id: string;
    invoice: string;
    source: string;
    status: string;
    paymentMethod: string;
    total: number;
    createdAt: string;
    items: { name: string; quantity: number; price: number }[];
};

type CustomerDetail = {
    customer: {
        id: string;
        name: string;
        email: string;
        phone: string | null;
        role: string;
        isActive: boolean;
        image: string | null;
        createdAt: string;
        isPartner: boolean;
        partner: PartnerInfo | null;
        addresses: AddressInfo[];
    };
    shopping: {
        orderCount: number;
        totalSpent: number;
        lastOrderAt: string | null;
        itemCount: number;
    };
    orderHistory: {
        orders: OrderRow[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};

const STATUS_TONES: Record<string, string> = {
    PENDING: "bg-[#fff2d6] text-[#8b5e00]",
    ACTIVE: "bg-[#e8f3e3] text-[#29621a]",
    REJECTED: "bg-[#f7e9e6] text-[#8c2e25]",
    SUSPENDED: "bg-[#f5ebd8] text-[#76551d]",
};

const ORDER_TONES: Record<string, string> = {
    PENDING: "bg-[#fff2d6] text-[#8b5e00]",
    PROCESSING: "bg-[#e0ecf9] text-[#1a4a6b]",
    PACKED: "bg-[#e8f3e3] text-[#29621a]",
    SHIPPED: "bg-[#dbeafe] text-[#1e40af]",
    COMPLETED: "bg-[#e8f3e3] text-[#29621a]",
    CANCELLED: "bg-[#f7e9e6] text-[#8c2e25]",
    CANCELED: "bg-[#f7e9e6] text-[#8c2e25]",
};

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const date = (v?: string | null) =>
    v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "-";
const datetime = (v?: string | null) =>
    v
        ? new Date(v).toLocaleString("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
          })
        : "-";

type Props = { customerId: string };

export function CustomerAdminDetailPanel({ customerId }: Props) {
    const [data, setData] = useState<CustomerDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);

    const load = useCallback(
        async (selectedPage: number) => {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/admin/customers/${customerId}?page=${selectedPage}&limit=10`, {
                    headers: { Accept: "application/json" },
                });
                const payload = (await response.json().catch(() => null)) as (CustomerDetail & { message?: string }) | null;
                if (!response.ok) throw new Error(payload?.message || "Detail pelanggan gagal dimuat.");
                setData(payload as CustomerDetail);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Detail pelanggan gagal dimuat.");
            } finally {
                setLoading(false);
            }
        },
        [customerId]
    );

    useEffect(() => {
        void load(page);
    }, [load, page]);

    if (loading) return <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat detail pelanggan..." />;
    if (error || !data) return <State icon={<User size={28} />} text={error || "Detail pelanggan tidak ditemukan."} />;

    const { customer, shopping, orderHistory } = data;
    const waLink = whatsappLink(customer.phone);

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin/pelanggan" className="text-sm font-bold text-[#184C3A]">← Kembali ke Pelanggan</Link>

                <header className="mt-4 mb-6 flex flex-wrap items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]">
                        <User size={26} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-black text-[#123d2d]">{customer.name}</h1>
                            {customer.isPartner ? (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_TONES[customer.partner?.status ?? ""] || "bg-gray-100"}`}>
                                    <Store size={11} /> MITRA
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f3e3] px-2.5 py-1 text-[10px] font-bold text-[#29621a]">
                                    <User size={11} /> PELANGGAN
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-[#69736d]">
                            Terdaftar {date(customer.createdAt)} · {customer.email}
                        </p>
                    </div>
                    {waLink && (
                        <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white hover:bg-[#1eb858]"
                        >
                            <MessageCircle size={15} /> WhatsApp
                        </a>
                    )}
                </header>

                <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Card icon={Boxes} label="Total Pesanan" value={String(shopping.orderCount)} />
                    <Card icon={Boxes} label="Item Dibeli" value={String(shopping.itemCount)} />
                    <Card icon={Store} label="Total Belanja" value={rupiah(shopping.totalSpent)} />
                    <Card icon={MapPin} label="Pesanan Terakhir" value={date(shopping.lastOrderAt)} />
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <div className="space-y-4 lg:col-span-2">
                        <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                            <h2 className="mb-3 text-sm font-black text-[#123d2d]">Riwayat Pesanan</h2>
                            {orderHistory.orders.length === 0 ? (
                                <p className="py-6 text-center text-xs text-[#69736d]">Belum ada pesanan.</p>
                            ) : (
                                <ul className="space-y-2">
                                    {orderHistory.orders.map((order) => (
                                        <li key={order.id} className="rounded-xl border border-[#f0ede4] px-3 py-2">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-bold text-[#123d2d]">{order.invoice}</p>
                                                    <p className="text-[10px] text-[#858a86]">
                                                        {datetime(order.createdAt)} · {order.items.reduce((sum, i) => sum + i.quantity, 0)} item · {order.source}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-black text-[#184C3A]">{rupiah(order.total)}</p>
                                                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${ORDER_TONES[String(order.status).toUpperCase()] || "bg-gray-100"}`}>
                                                        {String(order.status).toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="mt-1 truncate text-xs text-[#69736d]">
                                                {order.items.map((i) => `${i.name} x${i.quantity}`).join(", ")}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {orderHistory.totalPages > 1 && (
                                <div className="mt-3 flex items-center justify-between gap-3">
                                    <button
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => p - 1)}
                                        className="min-h-9 rounded-xl border border-[#ded9cc] bg-white px-3 text-xs font-bold text-[#123d2d] disabled:opacity-40"
                                    >
                                        ← Sebelumnya
                                    </button>
                                    <span className="text-xs font-bold text-[#69736d]">Halaman {page} dari {orderHistory.totalPages}</span>
                                    <button
                                        disabled={page >= orderHistory.totalPages}
                                        onClick={() => setPage((p) => p + 1)}
                                        className="min-h-9 rounded-xl border border-[#ded9cc] bg-white px-3 text-xs font-bold text-[#123d2d] disabled:opacity-40"
                                    >
                                        Berikutnya →
                                    </button>
                                </div>
                            )}
                        </section>
                    </div>

                    <div className="space-y-4">
                        {customer.isPartner && customer.partner && (
                            <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                                <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-[#123d2d]">
                                    <Handshake size={16} className="text-[#D4AF37]" /> Kartu Mitra
                                </h2>
                                <dl className="space-y-2 text-sm">
                                    <Field label="Nama Mitra" value={customer.partner.businessName || customer.partner.displayName} />
                                    <Field label="Kode" value={customer.partner.partnerCode} />
                                    <Field label="Status" value={partnerStatusLabels[customer.partner.status] || customer.partner.status} />
                                </dl>
                                <div className="mt-3 grid gap-2">
                                    <ActionLink href={`/admin/mitra/${customer.partner.id}`} label="Dashboard Mitra" />
                                    <ActionLink href={`/admin/mitra/${customer.partner.id}/lokasi`} label="Live Location" />
                                </div>
                            </section>
                        )}

                        <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                            <h2 className="mb-3 text-sm font-black text-[#123d2d]">Profil</h2>
                            <dl className="space-y-2 text-sm">
                                <Field label="Email" value={customer.email} />
                                <Field label="Telepon" value={customer.phone || "-"} />
                                <Field label="Role" value={customer.role} />
                                <Field label="Status Akun" value={customer.isActive ? "Aktif" : "Nonaktif"} />
                            </dl>
                        </section>
                    </div>
                </div>
            </div>
        </main>
    );
}

function ActionLink({ href, label }: { href: string; label: string }) {
    return (
        <Link href={href} className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[#184C3A] bg-white px-3 text-xs font-bold text-[#184C3A] hover:bg-[#184C3A] hover:text-white">
            {label}
        </Link>
    );
}

function Card({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">{label}</p>
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#184C3A] text-[#D4AF37]">
                    <Icon size={16} />
                </span>
            </div>
            <p className="mt-2 text-xl font-black text-[#123d2d]">{value}</p>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-[#f7f4ec] p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-[#123d2d]">{value}</p>
        </div>
    );
}

function State({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin/pelanggan" className="text-sm font-bold text-[#184C3A]">← Kembali ke Pelanggan</Link>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 px-4 py-16 text-center">
                    <span className="text-[#D4AF37]">{icon}</span>
                    <p className="text-sm font-semibold text-[#69736d]">{text}</p>
                </div>
            </div>
        </main>
    );
}