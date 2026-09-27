 "use client";

 import { useEffect, useState } from "react";
 import { X, Loader2, AlertCircle } from "lucide-react";
 import { OrderStatusBadge } from "./OrderStatusBadge";
 import { formatDate, formatRupiah } from "@/components/admin/kasir/kasir-shared";

 export interface OrderDetailItem {
     id: string;
     name: string;
     description?: string | null;
     notes?: string | null;
     itemType?: string;
     quantity: number;
     price: number;
     unitPrice?: number | null;
     subtotal: number;
 }

 export interface OrderDetailData {
     id: string;
     invoice: string;
     customer: string;
     phone: string;
     address: string;
     note?: string | null;
     source: string;
     status: string;
     paymentStatus: string;
     paymentMethod?: string;
     subtotal: number;
     discount: number;
     shipping: number;
     total: number;
     createdAt: string;
     items: OrderDetailItem[];
     courier?: string | null;
     serviceCode?: string | null;
     trackingNumber?: string | null;
     biteshipStatus?: string | null;
     biteshipTrackingId?: string | null;
 }

 interface OrderDetailProps {
     orderId: string;
     isOpen: boolean;
     onClose: () => void;
 }

 export function OrderDetail({ orderId, isOpen, onClose }: OrderDetailProps) {
     const [order, setOrder] = useState<OrderDetailData | null>(null);
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState("");

     useEffect(() => {
         if (!isOpen) return;

         setLoading(true);
         setError("");
         setOrder(null);

         fetch(`/api/admin/orders/${orderId}`)
             .then(async (res) => {
                 if (!res.ok) {
                     throw new Error(
                         res.status === 404
                             ? "Pesanan tidak ditemukan"
                             : "Gagal memuat detail pesanan"
                     );
                 }
                 return res.json();
             })
             .then((data) => setOrder(data.order))
             .catch((err) => setError(String(err.message || "Error")))
             .finally(() => setLoading(false));
     }, [orderId, isOpen]);

     if (!isOpen) return null;

     return (
         <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
             <div className="flex min-h-screen items-center justify-center p-4">
                 <div className="relative w-full max-w-2xl rounded-lg bg-white shadow-xl dark:bg-gray-900">
                     {/* Header */}
                     <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                         <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                             Detail Pesanan
                         </h2>
                         <button
                             onClick={onClose}
                             className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                         >
                             <X className="h-6 w-6" />
                         </button>
                     </div>

                     {/* Content */}
                     <div className="px-6 py-4">
                         {loading && (
                             <div className="flex h-40 items-center justify-center">
                                 <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                             </div>
                         )}

                         {error && (
                             <div className="flex items-center gap-3 rounded-lg bg-red-50 p-4 text-red-900 dark:bg-red-900/20 dark:text-red-300">
                                 <AlertCircle className="h-5 w-5 flex-shrink-0" />
                                 <p className="text-sm">{error}</p>
                             </div>
                         )}

                         {order && (
                             <div className="space-y-6">
                                 {/* Invoice & Dates */}
                                 <div className="grid grid-cols-2 gap-4">
                                     <div>
                                         <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                             No. Pesanan
                                         </label>
                                         <p className="mt-1 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                                             {order.invoice}
                                         </p>
                                     </div>
                                     <div>
                                         <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                             Tanggal
                                         </label>
                                         <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                             {formatDate(order.createdAt)}
                                         </p>
                                     </div>
                                 </div>

                                 {/* Customer Info */}
                                 <div>
                                     <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                         Pelanggan
                                     </label>
                                     <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                                         {order.customer}
                                     </p>
                                     <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                         {order.phone}
                                     </p>
                                 </div>

                                 {/* Address */}
                                 <div>
                                     <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                         Alamat
                                     </label>
                                     <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                         {order.address || "-"}
                                     </p>
                                 </div>

                                 {/* Shipping Info */}
                                 {order.courier && (
                                     <div>
                                         <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                             Pengiriman
                                         </label>
                                         <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                             {order.courier} {order.serviceCode ? `(${order.serviceCode})` : ""}
                                         </p>
                                         {order.trackingNumber && (
                                             <p className="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">
                                                 Resi: {order.trackingNumber}
                                             </p>
                                         )}
                                     </div>
                                 )}

                                 {/* Items */}
                                 <div>
                                     <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                         Item Pesanan
                                     </label>
                                     <div className="mt-2 space-y-2">
                                         {order.items.map((item) => (
                                             <div
                                                 key={item.id}
                                                 className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50"
                                             >
                                                 <div className="flex-1">
                                                     <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                         {item.name}
                                                     </p>
                                                     <p className="text-xs text-gray-500 dark:text-gray-400">
                                                         {item.quantity}x {formatRupiah(item.price)}
                                                     </p>
                                                     {item.description && (
                                                         <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                                                             {item.description}
                                                         </p>
                                                     )}
                                                 </div>
                                                 <div className="text-right">
                                                     <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                         {formatRupiah(item.subtotal)}
                                                     </p>
                                                 </div>
                                             </div>
                                         ))}
                                     </div>
                                 </div>

                                 {/* Financial Summary */}
                                 <div className="space-y-2 rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
                                     <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                         <span>Subtotal</span>
                                         <span>{formatRupiah(order.subtotal)}</span>
                                     </div>
                                     {order.discount > 0 && (
                                         <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                             <span>Diskon</span>
                                             <span>-{formatRupiah(order.discount)}</span>
                                         </div>
                                     )}
                                     {order.shipping > 0 && (
                                         <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                                             <span>Ongkir</span>
                                             <span>{formatRupiah(order.shipping)}</span>
                                         </div>
                                     )}
                                     <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
                                         <div className="flex justify-between font-semibold text-gray-900 dark:text-gray-100">
                                             <span>Total</span>
                                             <span>{formatRupiah(order.total)}</span>
                                         </div>
                                     </div>
                                 </div>

                                 {/* Status Badges */}
                                 <div className="space-y-2">
                                     <div className="flex items-center justify-between">
                                         <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                             Status Pembayaran
                                         </span>
                                         <OrderStatusBadge
                                             status={order.paymentStatus}
                                             variant="payment"
                                         />
                                     </div>
                                     <div className="flex items-center justify-between">
                                         <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                             Status Pesanan
                                         </span>
                                         <OrderStatusBadge status={order.status} variant="order" />
                                     </div>
                                 </div>
                             </div>
                         )}
                     </div>

                     {/* Footer */}
                     <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
                         <button
                             onClick={onClose}
                             className="w-full rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
                         >
                             Tutup
                         </button>
                     </div>
                 </div>
             </div>
         </div>
     );
 }