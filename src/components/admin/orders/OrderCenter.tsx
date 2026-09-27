 "use client";

 import { useCallback, useState, useEffect } from "react";
 import { useSearchParams, useRouter } from "next/navigation";
 import { OrderFilters } from "./OrderFilters";
 import { OrderTable, type OrderListItem } from "./OrderTable";
 import { OrderCard } from "./OrderCard";
 import { OrderDetail } from "./OrderDetail";
 import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

 const AFA_STORE_WHATSAPP = "6287770000883";

 function normalizePhone(phone: string): string {
     let clean = phone.replace(/\D/g, "").replace(/^0/, "62");
     if (!clean.startsWith("62")) {
         clean = "62" + clean;
     }
     return clean;
 }

 export function OrderCenter() {
     const router = useRouter();
     const searchParams = useSearchParams();

     const [orders, setOrders] = useState<OrderListItem[]>([]);
     const [loading, setLoading] = useState(true);
     const [error, setError] = useState("");

     const [page, setPage] = useState(1);
     const [totalPages, setTotalPages] = useState(1);
     const [search, setSearch] = useState("");
     const [source, setSource] = useState("");
     const [status, setStatus] = useState("");
     const [paymentStatus, setPaymentStatus] = useState("");

     const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
     const [detailOpen, setDetailOpen] = useState(false);

     // Load filters from URL
     useEffect(() => {
         const p = searchParams.get("page");
         const s = searchParams.get("search");
         const src = searchParams.get("source");
         const st = searchParams.get("status");
         const ps = searchParams.get("paymentStatus");

         if (p) setPage(Math.max(1, parseInt(p, 10)));
         if (s) setSearch(s);
         if (src) setSource(src);
         if (st) setStatus(st);
         if (ps) setPaymentStatus(ps);
     }, [searchParams]);

     // Fetch orders
     useEffect(() => {
         setLoading(true);
         setError("");

         const params = new URLSearchParams();
         params.set("page", String(page));
         params.set("limit", "20");
         if (search) params.set("search", search);
         if (source) params.set("source", source);
         if (status) params.set("status", status);
         if (paymentStatus) params.set("paymentStatus", paymentStatus);

         fetch(`/api/admin/orders?${params}`)
             .then(async (res) => {
                 if (!res.ok) throw new Error("Failed to fetch orders");
                 return res.json();
             })
             .then((data) => {
                 setOrders(data.orders);
                 setTotalPages(data.pagination.pages);
             })
             .catch((err) => setError(String(err.message)))
             .finally(() => setLoading(false));
     }, [page, search, source, status, paymentStatus]);

     const handleSearch = useCallback(
         (q: string) => {
             setSearch(q);
             setPage(1);
             updateUrl({
                 search: q,
                 source,
                 status,
                 paymentStatus,
                 page: 1,
             });
         },
         [source, status, paymentStatus]
     );

     const handleSourceChange = useCallback(
         (src: string) => {
             setSource(src);
             setPage(1);
             updateUrl({
                 search,
                 source: src,
                 status,
                 paymentStatus,
                 page: 1,
             });
         },
         [search, status, paymentStatus]
     );

     const handleStatusChange = useCallback(
         (st: string) => {
             setStatus(st);
             setPage(1);
             updateUrl({
                 search,
                 source,
                 status: st,
                 paymentStatus,
                 page: 1,
             });
         },
         [search, source, paymentStatus]
     );

     const handlePaymentStatusChange = useCallback(
         (ps: string) => {
             setPaymentStatus(ps);
             setPage(1);
             updateUrl({
                 search,
                 source,
                 status,
                 paymentStatus: ps,
                 page: 1,
             });
         },
         [search, source, status]
     );

     const updateUrl = (params: {
         search: string;
         source: string;
         status: string;
         paymentStatus: string;
         page: number;
     }) => {
         const sp = new URLSearchParams();
         if (params.page > 1) sp.set("page", String(params.page));
         if (params.search) sp.set("search", params.search);
         if (params.source) sp.set("source", params.source);
         if (params.status) sp.set("status", params.status);
         if (params.paymentStatus) sp.set("paymentStatus", params.paymentStatus);

         router.push(`/admin/orders?${sp.toString()}`);
     };

     const handlePageChange = (newPage: number) => {
         setPage(newPage);
         updateUrl({
             search,
             source,
             status,
             paymentStatus,
             page: newPage,
         });
     };

     const handleViewOrder = (orderId: string) => {
         setSelectedOrderId(orderId);
         setDetailOpen(true);
     };

     const handleWhatsApp = (phone: string, invoice: string) => {
         const normalized = normalizePhone(phone);
         const message = `Halo,\n\nKami ingin mengonfirmasi pesanan Anda:\nNo. Pesanan: ${invoice}\n\nTerima kasih telah berbelanja di AFA STORE 🙏`;
         const url = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
         window.open(url, "_blank", "noopener,noreferrer");
     };

     return (
         <div className="space-y-6">
             {/* Header */}
             <div>
                 <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                     Pesanan
                 </h1>
                 <p className="mt-1 text-gray-600 dark:text-gray-400">
                     Kelola seluruh transaksi AFA STORE
                 </p>
             </div>

             {/* Filters */}
             <OrderFilters
                 onSearch={handleSearch}
                 onSourceChange={handleSourceChange}
                 onStatusChange={handleStatusChange}
                 onPaymentStatusChange={handlePaymentStatusChange}
                 searchValue={search}
                 sourceValue={source}
                 statusValue={status}
                 paymentStatusValue={paymentStatus}
             />

             {/* Error */}
             {error && (
                 <div className="rounded-lg bg-red-50 p-4 text-red-900 dark:bg-red-900/20 dark:text-red-300">
                     {error}
                 </div>
             )}

             {/* Desktop Table */}
             <div className="hidden md:block">
                 <OrderTable
                     orders={orders}
                     loading={loading}
                     onView={handleViewOrder}
                     onWhatsApp={handleWhatsApp}
                 />
             </div>

             {/* Mobile Cards */}
             <div className="space-y-3 md:hidden">
                 {loading ? (
                     <div className="flex h-40 items-center justify-center">
                         <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                     </div>
                 ) : orders.length === 0 ? (
                     <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center dark:border-gray-600">
                         <p className="text-gray-500 dark:text-gray-400">
                             Tidak ada pesanan yang ditemukan
                         </p>
                     </div>
                 ) : (
                     orders.map((order) => (
                         <OrderCard
                             key={order.id}
                             order={order}
                             onView={handleViewOrder}
                             onWhatsApp={handleWhatsApp}
                         />
                     ))
                 )}
             </div>

             {/* Pagination */}
             {!loading && orders.length > 0 && totalPages > 1 && (
                 <div className="flex items-center justify-center gap-2">
                     <button
                         onClick={() => handlePageChange(page - 1)}
                         disabled={page === 1}
                         className="rounded-lg border border-gray-300 p-2 disabled:opacity-50 dark:border-gray-600"
                     >
                         <ChevronLeft className="h-5 w-5" />
                     </button>
                     <span className="text-sm text-gray-600 dark:text-gray-400">
                         Halaman {page} dari {totalPages}
                     </span>
                     <button
                         onClick={() => handlePageChange(page + 1)}
                         disabled={page >= totalPages}
                         className="rounded-lg border border-gray-300 p-2 disabled:opacity-50 dark:border-gray-600"
                     >
                         <ChevronRight className="h-5 w-5" />
                     </button>
                 </div>
             )}

             {/* Detail Modal */}
             {selectedOrderId && (
                 <OrderDetail
                     orderId={selectedOrderId}
                     isOpen={detailOpen}
                     onClose={() => setDetailOpen(false)}
                      onArchived={() => setOrders((current) => current.filter((order) => order.id !== selectedOrderId))}
                 />
             )}
         </div>
     );
 }