 "use client";

 import { useState } from "react";
 import { Search, X } from "lucide-react";

 export const ORDER_SOURCES_DISPLAY: Record<string, string> = {
     ONLINE: "Online",
     TATAP_MUKA: "Kasir",
     WHATSAPP: "WhatsApp",
     MARKETPLACE: "Marketplace",
     OTHER: "Lainnya",
 };

 export const ORDER_STATUSES: Record<string, string> = {
     PENDING: "Menunggu",
     PROCESSING: "Diproses",
     PACKED: "Dikemas",
     SHIPPED: "Dikirim",
     COMPLETED: "Selesai",
     CANCELLED: "Dibatalkan",
 };

 export const PAYMENT_STATUSES: Record<string, string> = {
     PENDING: "Belum Dibayar",
     WAITING_PAYMENT: "Menunggu Pembayaran",
     PAID: "Sudah Dibayar",
     EXPIRED: "Kedaluwarsa",
     CANCELLED: "Dibatalkan",
 };

 interface OrderFiltersProps {
     onSearch: (query: string) => void;
     onSourceChange: (source: string) => void;
     onStatusChange: (status: string) => void;
     onPaymentStatusChange: (status: string) => void;
     searchValue?: string;
     sourceValue?: string;
     statusValue?: string;
     paymentStatusValue?: string;
 }

 export function OrderFilters({
     onSearch,
     onSourceChange,
     onStatusChange,
     onPaymentStatusChange,
     searchValue = "",
     sourceValue = "",
     statusValue = "",
     paymentStatusValue = "",
 }: OrderFiltersProps) {
     const [search, setSearch] = useState(searchValue);

     const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         const value = e.target.value;
         setSearch(value);
         onSearch(value);
     };

     const clearSearch = () => {
         setSearch("");
         onSearch("");
     };

     return (
         <div className="space-y-4 rounded-lg border border-[#D4AF37]/20 bg-white p-4 dark:border-[#D4AF37]/10 dark:bg-[#0F4C45]/30">
             {/* Search */}
             <div>
                 <label htmlFor="search" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                     Cari Pesanan
                 </label>
                 <div className="relative mt-1">
                     <Search className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                     <input
                         id="search"
                         type="text"
                         placeholder="No. pesanan, nama, atau nomor WhatsApp"
                         value={search}
                         onChange={handleSearchChange}
                         className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-10 text-gray-900 placeholder-gray-500 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400"
                     />
                     {search && (
                         <button
                             onClick={clearSearch}
                             className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                         >
                             <X className="h-5 w-5" />
                         </button>
                     )}
                 </div>
             </div>

             {/* Source Filter */}
             <div>
                 <label htmlFor="source" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                     Sumber
                 </label>
                 <select
                     id="source"
                     value={sourceValue}
                     onChange={(e) => onSourceChange(e.target.value)}
                     className="mt-1 w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-gray-900 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                 >
                     <option value="">Semua Sumber</option>
                     {Object.entries(ORDER_SOURCES_DISPLAY).map(([key, label]) => (
                         <option key={key} value={key}>
                             {label}
                         </option>
                     ))}
                 </select>
             </div>

             {/* Status Filter */}
             <div>
                 <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                     Status Pesanan
                 </label>
                 <select
                     id="status"
                     value={statusValue}
                     onChange={(e) => onStatusChange(e.target.value)}
                     className="mt-1 w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-gray-900 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                 >
                     <option value="">Semua Status</option>
                     {Object.entries(ORDER_STATUSES).map(([key, label]) => (
                         <option key={key} value={key}>
                             {label}
                         </option>
                     ))}
                 </select>
             </div>

             {/* Payment Status Filter */}
             <div>
                 <label htmlFor="paymentStatus" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                     Status Pembayaran
                 </label>
                 <select
                     id="paymentStatus"
                     value={paymentStatusValue}
                     onChange={(e) => onPaymentStatusChange(e.target.value)}
                     className="mt-1 w-full rounded-lg border border-gray-300 bg-white py-2 px-3 text-gray-900 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37] dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                 >
                     <option value="">Semua Status Pembayaran</option>
                     {Object.entries(PAYMENT_STATUSES).map(([key, label]) => (
                         <option key={key} value={key}>
                             {label}
                         </option>
                     ))}
                 </select>
             </div>
         </div>
     );
 }