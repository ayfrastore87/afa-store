 "use client";

 import { Eye, MessageCircle } from "lucide-react";
 import { OrderStatusBadge } from "./OrderStatusBadge";
 import { formatDate, formatRupiah } from "@/components/admin/kasir/kasir-shared";

 export type OrderListItem = {
     id: string;
     invoice: string;
     customer: string;
     phone: string;
     source: string;
     status: string;
     paymentStatus: string;
     total: number;
     createdAt: string;
     payment?: {
         status: string;
     } | null;
 };

 interface OrderTableProps {
     orders: OrderListItem[];
     loading?: boolean;
     onView: (orderId: string) => void;
     onWhatsApp: (phone: string, orderInvoice: string) => void;
 }

 export function OrderTable({
     orders,
     loading = false,
     onView,
     onWhatsApp,
 }: OrderTableProps) {
     if (loading) {
         return (
             <div className="flex h-40 items-center justify-center">
                 <div className="text-gray-500 dark:text-gray-400">Memuat pesanan...</div>
             </div>
         );
     }

     if (orders.length === 0) {
         return (
             <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                 <div className="text-gray-500 dark:text-gray-400">Tidak ada pesanan yang ditemukan</div>
             </div>
         );
     }

     return (
         <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
             <table className="w-full">
                 <thead>
                     <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                         <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                             No. Pesanan
                         </th>
                         <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                             Pelanggan
                         </th>
                         <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                             Sumber
                         </th>
                         <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                             Total
                         </th>
                         <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                             Pembayaran
                         </th>
                         <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                             Status
                         </th>
                         <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                             Tanggal
                         </th>
                         <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                             Aksi
                         </th>
                     </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                     {orders.map((order) => (
                         <tr
                             key={order.id}
                             className="hover:bg-gray-50 dark:hover:bg-gray-800/30"
                         >
                             <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">
                                 {order.invoice}
                             </td>
                             <td className="px-4 py-3">
                                 <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                     {order.customer}
                                 </div>
                                 <div className="text-xs text-gray-500 dark:text-gray-400">
                                     {order.phone}
                                 </div>
                             </td>
                             <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                 {order.source === "TATAP_MUKA"
                                     ? "Kasir"
                                     : order.source === "ONLINE"
                                     ? "Online"
                                     : order.source === "WHATSAPP"
                                     ? "WhatsApp"
                                     : order.source}
                             </td>
                             <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                 {formatRupiah(order.total)}
                             </td>
                             <td className="px-4 py-3">
                                 <OrderStatusBadge
                                     status={order.paymentStatus}
                                     variant="payment"
                                 />
                             </td>
                             <td className="px-4 py-3">
                                 <OrderStatusBadge
                                     status={order.status}
                                     variant="order"
                                 />
                             </td>
                             <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                 {formatDate(order.createdAt)}
                             </td>
                             <td className="px-4 py-3 text-center">
                                 <div className="flex items-center justify-center gap-2">
                                     <button
                                         onClick={() => onView(order.id)}
                                         className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                                         title="Lihat detail"
                                     >
                                         <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                     </button>
                                     <button
                                         onClick={() => onWhatsApp(order.phone, order.invoice)}
                                         className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
                                         title="Hubungi via WhatsApp"
                                     >
                                         <MessageCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                                     </button>
                                 </div>
                             </td>
                         </tr>
                     ))}
                 </tbody>
             </table>
         </div>
     );
 }