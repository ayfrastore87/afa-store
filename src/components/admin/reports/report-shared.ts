// Shared types, labels, and export helpers for the AFA STORE admin "Laporan
// Penjualan" page. Pure client-side helpers — no data fetching or mutation.

export type Period = "hari" | "minggu" | "bulan" | "tahun" | "semua";
export type ChartGranularity = "harian" | "mingguan" | "bulanan";

export const PERIODS: { id: Period; label: string }[] = [
    { id: "hari", label: "Hari Ini" },
    { id: "minggu", label: "7 Hari Terakhir" },
    { id: "bulan", label: "Bulan Ini" },
    { id: "tahun", label: "Tahun Ini" },
    { id: "semua", label: "Semua Waktu" },
];

export const CHART_GRANULARITIES: { id: ChartGranularity; label: string }[] = [
    { id: "harian", label: "Harian" },
    { id: "mingguan", label: "Mingguan" },
    { id: "bulanan", label: "Bulanan" },
];

export const STATUS_FILTERS: { id: string; label: string }[] = [
    { id: "semua", label: "Semua Status" },
    { id: "selesai", label: "Selesai" },
    { id: "diproses", label: "Diproses" },
    { id: "pending", label: "Pending" },
    { id: "dibatalkan", label: "Dibatalkan" },
];

export type ReportSummary = {
    revenue: number;
    transactionCount: number;
    itemsSold: number;
    averageTransaction: number;
    subtotal: number;
    discount: number;
    shipping: number;
    grandTotal: number;
    completed: number;
    pending: number;
    cancelled: number;
};

export type TopProduct = { name: string; quantity: number; revenue: number };
export type CustomerStats = { total: number; newCount: number; returningCount: number };
export type PaymentMethodStat = { method: string; count: number; total: number };
export type OrderStatusStat = { status: string; count: number };
export type ChartPoint = { label: string; revenue: number; count: number };

export type SalesReport = {
    period: Period;
    from: string | null;
    generatedAt: string;
    summary: ReportSummary;
    topProducts: TopProduct[];
    customers: CustomerStats;
    paymentMethods: PaymentMethodStat[];
    orderStatuses: OrderStatusStat[];
    chart: {
        harian: ChartPoint[];
        mingguan: ChartPoint[];
        bulanan: ChartPoint[];
    };
    recentOrders: ReportTransaction[];
};

export type ReportTransaction = {
    id: string;
    invoice: string;
    customer: string;
    phone: string;
    source: string;
    paymentMethod: string;
    status: string;
    total: number;
    createdAt: string;
};

export type TransactionsResponse = {
    orders: ReportTransaction[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
};

const PAYMENT_METHOD_REPORT_LABELS: Record<string, string> = {
    TUNAI: "Cash",
    CASH: "Cash",
    TRANSFER: "Transfer",
    TRANSFER_BANK: "Transfer",
    BANK_TRANSFER: "Transfer",
    QRIS: "QRIS",
    COD: "COD",
    MIDTRANS: "Midtrans",
    TRIPAY: "Tripay",
    XENDIT: "Xendit",
};

export function paymentMethodLabel(method: string | null | undefined) {
    const key = String(method ?? "").toUpperCase();
    return PAYMENT_METHOD_REPORT_LABELS[key] ?? (method ? String(method) : "-");
}

const STATUS_REPORT_LABELS: Record<string, string> = {
    PENDING: "Menunggu",
    WAITING_PAYMENT: "Menunggu Bayar",
    PAID: "Lunas",
    PROCESSING: "Diproses",
    PACKED: "Dikemas",
    SHIPPED: "Dikirim",
    COMPLETED: "Selesai",
    CANCELLED: "Dibatalkan",
    CANCELED: "Dibatalkan",
};

export function statusLabel(status: string | null | undefined) {
    const key = String(status ?? "").toUpperCase();
    return STATUS_REPORT_LABELS[key] ?? (status ? String(status) : "-");
}

export function exportCsv(filename: string, rows: Record<string, string | number>[]) {
    if (!rows.length) return;
    const header = Object.keys(rows[0]);
    const body = rows.map((row) => header.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

export async function exportPdf(title: string, rows: Record<string, string | number>[]) {
    if (!rows.length) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.text(title, 14, 16);
    rows.slice(0, 60).forEach((row, index) => {
        const line = Object.values(row).join(" | ").slice(0, 105);
        doc.text(line, 14, 28 + index * 6);
    });
    doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}.pdf`);
}

export async function exportXlsx(filename: string, rows: Record<string, string | number>[]) {
    if (!rows.length) return;
    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Laporan");
    XLSX.writeFile(workbook, filename);
}
