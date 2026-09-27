 "use client";

 import { Eye, MessageCircle } from "lucide-react";
 import { OrderStatusBadge } from "./OrderStatusBadge";
 import { formatDate, formatRupiah } from "@/components/admin/kasir/kasir-shared";
 import type { OrderListItem } from "./OrderTable";

 interface OrderCardProps {
     order: OrderListItem;
     onView: (orderId: string) => void;
     onWhatsApp: (phone: string, orderInvoice: string) => void;
 }

 export function OrderCard({ order, onView, onWhatsApp }: OrderCardProps) {
     return (
         <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
             {/* Header: Invoice + Date */}
             <div className="flex flex-col gap-1 border-b border-gray-200 pb-3 dark:border-gray-700">
                 <div className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
                     {order.invoice}
                 </div>
                 <div className="text-xs text-gray-500 dark:text-gray-400">
                     {formatDate(order.createdAt)}
                 </div>
             </div>

             {/* Customer Info */}
             <div className="mt-3 space-y-1">
                 <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                     {order.customer}
                 </div>
                 <div className="text-xs text-gray-500 dark:text-gray-400">
                     {order.phone}
                 </div>
             </div>

             {/* Source + Amount */}
             <div className="mt-3 flex items-center justify-between">
                 <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                     {order.source === "TATAP_MUKA"
                         ? "Kasir"
                         : order.source === "ONLINE"
                         ? "Online"
                         : order.source === "WHATSAPP"
                         ? "WhatsApp"
                         : order.source}
                 </div>
                 <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                     {formatRupiah(order.total)}
                 </div>
             </div>

             {/* Status Badges */}
             <div className="mt-3 flex flex-wrap gap-2">
                 <OrderStatusBadge status={order.paymentStatus} variant="payment" />
                 <OrderStatusBadge status={order.status} variant="order" />
             </div>

             {/* Actions */}
             <div className="mt-4 flex gap-2">
                 <button
                     onClick={() => onView(order.id)}
                     className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
                 >
                     <Eye className="h-4 w-4" />
                     Lihat
                 </button>
                 <button
                     onClick={() => onWhatsApp(order.phone, order.invoice)}
                     className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
                 >
                     <MessageCircle className="h-4 w-4" />
                     WhatsApp
                 </button>
             </div>
         </div>
     );
 }