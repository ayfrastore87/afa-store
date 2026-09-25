import KasirDeliveryMonitoring from "@/components/admin/kasir/KasirDeliveryMonitoring";

export const dynamic = "force-dynamic";

export default function KasirMonitoringPage() {
    return <KasirDeliveryMonitoring detailBasePath="/kasir/transaksi" />;
}
