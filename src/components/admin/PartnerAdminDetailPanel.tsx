"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Boxes, Clock, Loader2, MapPin, Package, Store, Tags, TrendingUp, Wallet } from "lucide-react";

import { partnerStatusLabels, partnerTypeLabels } from "@/lib/partner";
import { movementTypeLabel, referenceLabel } from "@/components/partner/partner-shared";
import { ACCURACY_QUALITY_LABELS, getAccuracyQuality, getLocationLiveStatus, relativeTimeAgo } from "@/lib/location-status";

type DetailUser = { id: string; name: string; email: string; phone: string | null; isActive: boolean; role: string };

type PartnerDetail = {
    partner: {
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
        updatedAt: string;
        user: DetailUser | null;
    };
    sales: {
        today: { revenue: number; count: number; grossProfit: number };
        month: { revenue: number; count: number; grossProfit: number };
        allTime: { revenue: number; count: number; grossProfit: number };
    };
    stock: { totalUnits: number; skuCount: number; lowStock: number; inStock: number; outOfStock: number };
    location: { id: string; latitude: number; longitude: number; accuracy: number | null; source: string; consent: boolean; recordedAt: string } | null;
    recentSales: { id: string; saleNumber: string; soldAt: string; total: number; grossProfit: number; status: string; itemCount: number }[];
    movements: { id: string; type: string; quantity: number; unitPrice: number | null; referenceType: string | null; note: string | null; createdAt: string; productName: string }[];
    topProducts: { name: string; quantity: number; revenue: number }[];
};

type Props = { partnerId: string };

const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const date = (v?: string | null) =>
    v ? new Date(v).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

const statusTone: Record<string, string> = {
    PENDING: "bg-[#fff2d6] text-[#8b5e00]",
    ACTIVE: "bg-[#e8f3e3] text-[#29621a]",
    REJECTED: "bg-[#f7e9e6] text-[#8c2e25]",
    SUSPENDED: "bg-[#f5ebd8] text-[#76551d]",
};

export function PartnerAdminDetailPanel({ partnerId }: Props) {
    const [data, setData] = useState<PartnerDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const response = await fetch(`/api/admin/partners/${partnerId}/detail`, { headers: { Accept: "application/json" } });
            const payload = (await response.json().catch(() => null)) as (PartnerDetail & { message?: string }) | null;
            if (!response.ok) throw new Error(payload?.message || "Detail mitra gagal dimuat.");
            setData(payload as PartnerDetail);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Detail mitra gagal dimuat.");
        } finally {
            setLoading(false);
        }
    }, [partnerId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) return <State icon={<Loader2 className="animate-spin" size={28} />} text="Memuat detail mitra..." />;
    if (error || !data) return <State icon={<Store size={28} />} text={error || "Detail mitra tidak ditemukan."} />;

    const { partner, sales, stock, location } = data;
    const name = partner.businessName || partner.displayName;
    const liveStatus = location ? getLocationLiveStatus(location.recordedAt) : "OFFLINE";
    const locationAccuracy = location?.accuracy != null ? `±${Math.round(location.accuracy)} m · ${ACCURACY_QUALITY_LABELS[getAccuracyQuality(location.accuracy)]}` : "-";

    return (
        <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17241d]">
            <div className="mx-auto max-w-5xl">
                <Link href="/admin/mitra" className="text-sm font-bold text-[#184C3A]">← Kembali ke Mitra</Link>

                <header className="mt-4 mb-6 flex flex-wrap items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#184C3A] text-[#D4AF37]">
                        <Store size={26} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-2xl font-black text-[#123d2d]">{name}</h1>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTone[partner.status] || "bg-gray-100"}`}>
                                {partnerStatusLabels[partner.status] || partner.status}
                            </span>
                        </div>
                        <p className="text-sm text-[#69736d]">
                            {partner.partnerCode} · {partnerTypeLabels[partner.partnerType] || partner.partnerType}
                        </p>
                        {partner.displayName !== name && <p className="text-xs text-[#858a86]">Nama tampilan: {partner.displayName}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {partner.status === "ACTIVE" && (
                            <>
                                <ActionLink href={`/admin/mitra/${partner.id}/stok`} icon={<Boxes size={15} />} label="Stok" />
                                <ActionLink href={`/admin/mitra/${partner.id}/harga`} icon={<Tags size={15} />} label="Harga" />
                                <ActionLink href={`/admin/mitra/${partner.id}/lokasi`} icon={<MapPin size={15} />} label="Lokasi" />
                            </>
                        )}
                    </div>
                </header>

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Card icon={Wallet} label="Pendapatan (Semua)" value={rupiah(sales.allTime.revenue)} sub={`${sales.allTime.count} transaksi`} />
                    <Card icon={TrendingUp} label="Bulan Ini" value={rupiah(sales.month.revenue)} sub={`${sales.month.count} transaksi · margin ${rupiah(sales.month.grossProfit)}`} />
                    <Card icon={Clock} label="Hari Ini" value={rupiah(sales.today.revenue)} sub={`${sales.today.count} transaksi`} />
                    <Card icon={Boxes} label="Stok" value={`${stock.totalUnits} unit`} sub={`${stock.inStock} produk · ${stock.lowStock} menipis · ${stock.outOfStock} habis`} />
                </section>

                <section className="mt-4 rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <MapPin size={16} className="text-[#D4AF37]" />
                            <h2 className="text-sm font-black text-[#123d2d]">Lokasi</h2>
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${liveStatus === "LIVE" ? "bg-[#e8f3e3] text-[#29621a]" : "bg-[#f0ede4] text-[#69736d]"}`}>
                                <span className={`h-2 w-2 rounded-full ${liveStatus === "LIVE" ? "animate-pulse bg-[#2fa24a]" : "bg-[#9aa09b]"}`} />
                                {liveStatus === "LIVE" ? "Live" : "Offline"}
                            </span>
                        </div>
                        <Link
                            href={`/admin/mitra/${partner.id}/lokasi`}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#184C3A] px-3 py-2 text-xs font-bold text-white hover:bg-[#123a36]"
                        >
                            Lihat Live Map
                        </Link>
                    </div>

                    {!location ? (
                        <p className="mt-3 text-xs text-[#69736d]">Mitra belum menyimpan lokasi.</p>
                    ) : (
                        <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                            <Field label="Status" value={liveStatus === "LIVE" ? "● Live" : "○ Offline"} />
                            <Field label="Terakhir Update" value={relativeTimeAgo(location.recordedAt)} />
                            <Field label="Akurasi" value={locationAccuracy} />
                        </dl>
                    )}
                </section>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                        <h2 className="mb-3 text-sm font-black text-[#123d2d]">Informasi Mitra</h2>
                        <dl className="grid gap-3 sm:grid-cols-2">
                            <Field label="Akun" value={partner.user ? `${partner.user.name} · ${partner.user.email}` : "-"} />
                            <Field label="Telepon" value={partner.phone || partner.user?.phone || "-"} />
                            <Field label="Jenis Mitra" value={partnerTypeLabels[partner.partnerType] || partner.partnerType} />
                            <Field label="Terdaftar Sejak" value={date(partner.createdAt)} />
                            <Field label="Alamat" value={[partner.address, partner.village, partner.district, partner.city, partner.postalCode].filter(Boolean).join(", ") || "-"} />
                        </dl>
                    </section>

                    <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                        <h2 className="mb-3 flex items-center gap-2 text-sm font-black text-[#123d2d]">
                            <Package size={16} className="text-[#D4AF37]" /> Produk Terlaris
                        </h2>
                        {data.topProducts.length === 0 ? (
                            <p className="py-6 text-center text-xs text-[#69736d]">Belum ada produk terjual.</p>
                        ) : (
                            <ul className="space-y-2">
                                {data.topProducts.map((product, index) => (
                                    <li key={product.name} className="flex items-center gap-3 rounded-xl border border-[#f0ede4] px-3 py-2">
                                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#184C3A] text-xs font-black text-white">{index + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-[#123d2d]">{product.name}</p>
                                            <p className="text-[10px] text-[#858a86]">{rupiah(product.revenue)}</p>
                                        </div>
                                        <span className="text-sm font-black text-[#184C3A]">{product.quantity} unit</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                        <h2 className="mb-3 text-sm font-black text-[#123d2d]">Penjualan Terakhir</h2>
                        {data.recentSales.length === 0 ? (
                            <p className="py-6 text-center text-xs text-[#69736d]">Belum ada penjualan.</p>
                        ) : (
                            <ul className="space-y-2">
                                {data.recentSales.map((sale) => (
                                    <li key={sale.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#f0ede4] px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-[#123d2d]">{sale.saleNumber}</p>
                                            <p className="text-[10px] text-[#858a86]">{date(sale.soldAt)} · {sale.itemCount} item</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-[#184C3A]">{rupiah(sale.total)}</p>
                                            <p className="text-[10px] text-[#858a86]">Margin {rupiah(sale.grossProfit)}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
                        <h2 className="mb-3 text-sm font-black text-[#123d2d]">Mutasi Stok Terakhir</h2>
                        {data.movements.length === 0 ? (
                            <p className="py-6 text-center text-xs text-[#69736d]">Belum ada mutasi stok.</p>
                        ) : (
                            <ul className="space-y-2">
                                {data.movements.map((movement) => (
                                    <li key={movement.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#f0ede4] px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-[#123d2d]">{movement.productName}</p>
                                            <p className="text-[10px] text-[#858a86]">{movementTypeLabel(movement.type)} · {referenceLabel(movement.referenceType)} · {date(movement.createdAt)}</p>
                                        </div>
                                        <span className={`shrink-0 text-sm font-black ${movement.type === "IN" ? "text-[#29621a]" : "text-[#8c2e25]"}`}>
                                            {movement.type === "IN" ? "+" : "-"}{movement.quantity}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </main>
    );
}

function ActionLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link href={href} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#184C3A] bg-white px-4 text-sm font-bold text-[#184C3A] hover:bg-[#184C3A] hover:text-white">
            {icon} {label}
        </Link>
    );
}

function Card({ icon: Icon, label, value, sub }: { icon: typeof Wallet; label: string; value: string; sub: string }) {
    return (
        <div className="rounded-2xl border border-[#ded9cc] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-[#858a86]">{label}</p>
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#184C3A] text-[#D4AF37]">
                    <Icon size={16} />
                </span>
            </div>
            <p className="mt-2 text-xl font-black text-[#123d2d]">{value}</p>
            <p className="mt-1 text-xs font-semibold text-[#69736d]">{sub}</p>
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
                <Link href="/admin/mitra" className="text-sm font-bold text-[#184C3A]">← Kembali ke Mitra</Link>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[#ded9cc] bg-white/60 px-4 py-16 text-center">
                    <span className="text-[#D4AF37]">{icon}</span>
                    <p className="text-sm font-semibold text-[#69736d]">{text}</p>
                </div>
            </div>
        </main>
    );
}
