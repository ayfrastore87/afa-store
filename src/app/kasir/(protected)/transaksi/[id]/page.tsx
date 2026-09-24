import KasirTransactionDetail from "@/components/admin/kasir/KasirTransactionDetail";
export const dynamic = "force-dynamic";
export default async function KasirTransactionPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <KasirTransactionDetail id={id} />;
}