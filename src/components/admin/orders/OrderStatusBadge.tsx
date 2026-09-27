 "use client";

 import { orderStatusLabels } from "@/lib/orders";
 import { getPaymentStatusPresentation } from "@/lib/payment-status";

 export type OrderStatusBadgeVariant = "order" | "payment";

 function getOrderStatusClass(status: string): string {
     const upper = String(status ?? "").toUpperCase();
     switch (upper) {
         case "PENDING":
             return "bg-amber-100 text-amber-900 ring-1 ring-amber-300/60";
         case "PROCESSING":
             return "bg-blue-100 text-blue-900 ring-1 ring-blue-300/60";
         case "PACKED":
             return "bg-indigo-100 text-indigo-900 ring-1 ring-indigo-300/60";
         case "SHIPPED":
             return "bg-purple-100 text-purple-900 ring-1 ring-purple-300/60";
         case "COMPLETED":
             return "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300/60";
         case "CANCELLED":
             return "bg-red-100 text-red-900 ring-1 ring-red-300/60";
         default:
             return "bg-slate-200 text-slate-800 ring-1 ring-slate-300/70";
     }
 }

 interface OrderStatusBadgeProps {
     status: string | null | undefined;
     variant?: OrderStatusBadgeVariant;
 }

 export function OrderStatusBadge({
     status,
     variant = "order",
 }: OrderStatusBadgeProps) {
     if (variant === "payment") {
         const presentation = getPaymentStatusPresentation(status);
         return (
             <span
                 className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${presentation.tone}`}
             >
                 {presentation.label}
             </span>
         );
     }

     const upper = String(status ?? "").toUpperCase();
     const label =
         orderStatusLabels[upper] || orderStatusLabels[String(status ?? "").toLowerCase()] || status || "-";
     const className = getOrderStatusClass(upper);

     return (
         <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
             {label}
         </span>
     );
 }