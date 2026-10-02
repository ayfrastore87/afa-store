 "use client";

 import { useEffect, useState } from "react";
import { X, Loader2, AlertCircle, Upload, Trash2 } from "lucide-react";
import Swal from "sweetalert2";
 import { OrderStatusBadge } from "./OrderStatusBadge";
 import { formatDate, formatRupiah } from "@/components/admin/kasir/kasir-shared";
 import { biteshipStatusLabel } from "@/lib/kasir-delivery";
 import { hasRealShipment, kasirShipmentAction } from "@/lib/kasir-delivery";
import { compressHandoverImage } from "@/lib/client-image";

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
      payment?: { transactionId?: string | null; paymentType?: string | null } | null;
     subtotal: number;
     discount: number;
     shipping: number;
     total: number;
     createdAt: string;
     items: OrderDetailItem[];
     courier?: string | null;
      service?: string | null;
     serviceCode?: string | null;
      courierCode?: string | null;
      destinationAreaId?: string | null;
      biteshipOrderId?: string | null;
     trackingNumber?: string | null;
     biteshipStatus?: string | null;
     biteshipTrackingId?: string | null;
      biteshipLabelUrl?: string | null;
      handoverPhotoUrl?: string | null;
      handedOverAt?: string | null;
 }

 interface OrderDetailProps {
     orderId: string;
     isOpen: boolean;
     onClose: () => void;
    onArchived: () => void;
 }

export function OrderDetail({ orderId, isOpen, onClose, onArchived }: OrderDetailProps) {
     const [order, setOrder] = useState<OrderDetailData | null>(null);
     const [loading, setLoading] = useState(false);
     const [error, setError] = useState("");
    const [archiving, setArchiving] = useState(false);
    const [creatingShipment, setCreatingShipment] = useState(false);
    const [handoverFile, setHandoverFile] = useState<File | null>(null);
    const [originalHandoverSize, setOriginalHandoverSize] = useState<number | null>(null);
    const [processingHandover, setProcessingHandover] = useState(false);
    const [savingHandover, setSavingHandover] = useState(false);

    async function saveHandover() {
        if (!order || !handoverFile || savingHandover) return;
        setSavingHandover(true);
        try {
            const body = new FormData(); body.append("file", handoverFile);
            const response = await fetch(`/api/admin/orders/${order.id}/handover`, { method: "POST", body });
            const contentType = response.headers.get("content-type") || "";
            let payload: { message?: string; error?: string; order?: OrderDetailData } = {};
            if (contentType.toLowerCase().includes("application/json")) { try { payload = await response.json(); } catch { payload = {}; } }
            else { try { await response.text(); } catch { /* safe fallback */ } }
            if (!response.ok) throw new Error(payload.error || payload.message || "Gagal menyimpan bukti penyerahan. Silakan coba lagi.");
            setOrder(current => current && payload.order ? { ...current, ...payload.order } : current);
            setHandoverFile(null);
            await Swal.fire({ title: "Status diperbarui", text: "Paket telah diserahkan kepada driver oleh petugas AFA STORE.", icon: "success", timer: 1500, showConfirmButton: false });
        } catch (e) { setError(e instanceof Error ? e.message : "Foto gagal disimpan."); } finally { setSavingHandover(false); }
    }

    async function chooseHandoverFile(file: File | undefined) {
        if (!file) return;
        setProcessingHandover(true); setError(""); setOriginalHandoverSize(file.size);
        try { setHandoverFile(await compressHandoverImage(file)); }
        catch (e) { setHandoverFile(null); setError(e instanceof Error ? e.message : "Foto tidak dapat diproses."); }
        finally { setProcessingHandover(false); }
    }

    async function confirmPayment() {
        if (!order || order.paymentStatus.toUpperCase() === "PAID") return;
        const isCash = (order.paymentMethod || "").toUpperCase() === "TUNAI";
        const isQris = (order.paymentMethod || "").toUpperCase() === "QRIS";
        if (!isCash && !isQris) return;
        const result = await Swal.fire({
            title: isCash ? "Konfirmasi pembayaran tunai?" : "Konfirmasi pembayaran QRIS?",
            html: `<p>${isCash ? `Pastikan uang sebesar <b>${formatRupiah(order.total)}</b> telah diterima.` : `Pastikan pembayaran sebesar <b>${formatRupiah(order.total)}</b> telah masuk ke rekening/merchant AFA STORE sebelum mengonfirmasi.`}</p><p class="mt-3 text-left"><b>No. Pesanan:</b> ${order.invoice}<br/><b>Nama Pelanggan:</b> ${order.customer}<br/><b>Total Tagihan:</b> ${formatRupiah(order.total)}<br/><b>Metode:</b> ${isCash ? "COD / Tunai" : "QRIS"}</p>`,
            icon: "warning",
            showCancelButton: true,
            cancelButtonText: "Batal",
            confirmButtonText: isCash ? "Ya, Uang Diterima" : "Ya, Pembayaran Diterima",
            confirmButtonColor: "#123524",
            cancelButtonColor: "#6b7280",
            showLoaderOnConfirm: true,
            preConfirm: async () => {
                const endpoint = isCash
                    ? `/api/admin/orders/${order.id}/payment/confirm`
                    : `/api/admin/kasir/orders/${order.id}/confirm-qris-payment`;
                const response = await fetch(endpoint, { method: "POST" });
                 const payload = await response.json().catch(() => null) as { message?: string; orderStatus?: string } | null;
                if (!response.ok) {
                    Swal.showValidationMessage(payload?.message || "Pembayaran gagal dikonfirmasi.");
                    return undefined;
                }
                return payload;
            },
        });
        if (result.isConfirmed) {
            await Swal.fire({ title: "Pembayaran dikonfirmasi", icon: "success", timer: 1400, showConfirmButton: false });
             const confirmed = result.value as { orderStatus?: string } | undefined;
             setOrder((current) => current ? { ...current, paymentStatus: "PAID", status: confirmed?.orderStatus ?? current.status } : current);
        }
    }

    async function createShipment() {
        if (!order || creatingShipment) return;
        const result = await Swal.fire({
            title: "Buat Pengiriman?",
            html: `<p>Pesanan akan dibuat ke layanan pengiriman yang telah dipilih pelanggan.</p><p class="mt-3 text-left"><b>Kurir:</b> ${order.courier || "-"}<br/><b>Layanan:</b> ${order.service || order.serviceCode || "-"}<br/><b>Ongkir:</b> ${formatRupiah(order.shipping)}</p>`,
            icon: "question",
            showCancelButton: true,
            cancelButtonText: "Batal",
            confirmButtonText: "Buat Pengiriman",
            confirmButtonColor: "#123524",
            cancelButtonColor: "#6b7280",
            showLoaderOnConfirm: true,
            allowOutsideClick: () => !Swal.isLoading(),
            preConfirm: async () => {
                const response = await fetch(`/api/admin/orders/${order.id}/biteship`, { method: "POST", headers: { Accept: "application/json" } });
                const payload = await response.json().catch(() => null) as { message?: string } | null;
                if (!response.ok) {
                    Swal.showValidationMessage(payload?.message || "Pengiriman belum berhasil dibuat.");
                    return undefined;
                }
                return payload;
            },
        });
        if (!result.isConfirmed) return;
        setCreatingShipment(true);
        try {
            const response = await fetch(`/api/admin/orders/${order.id}`);
            const payload = await response.json() as { order?: OrderDetailData };
            if (!response.ok || !payload.order) throw new Error("Status pengiriman belum dapat diperbarui.");
            setOrder(payload.order);
            await Swal.fire({ title: "Pengiriman dibuat", icon: "success", timer: 1400, showConfirmButton: false });
        } catch (shipmentError) {
            setError(shipmentError instanceof Error ? shipmentError.message : "Status pengiriman belum dapat diperbarui.");
        } finally {
            setCreatingShipment(false);
        }
    }

    async function archiveOrder() {
        if (archiving) return;
        setArchiving(true);
        try {
            const result = await Swal.fire({
                title: "Hapus pesanan?",
                text: "Pesanan akan dihapus dari daftar aktif, tetapi riwayat transaksi tetap tersimpan untuk laporan.",
                icon: "warning",
                showCancelButton: true,
                confirmButtonText: "Hapus Pesanan",
                cancelButtonText: "Batal",
                confirmButtonColor: "#b91c1c",
                cancelButtonColor: "#6b7280",
                showLoaderOnConfirm: true,
                allowOutsideClick: () => !Swal.isLoading(),
                preConfirm: async () => {
                    const response = await fetch(`/api/admin/orders/${orderId}`, { method: "DELETE" });
                    const payload = await response.json().catch(() => null) as { message?: string } | null;
                    if (!response.ok) {
                        Swal.showValidationMessage(payload?.message || "Pesanan gagal diarsipkan");
                        return undefined;
                    }
                    return payload;
                },
            });

            if (!result.isConfirmed) return;
            await Swal.fire({
                title: "Pesanan berhasil diarsipkan",
                icon: "success",
                timer: 1800,
                showConfirmButton: false,
            });
            onArchived();
            onClose();
        } catch (archiveError) {
            setError(archiveError instanceof Error ? archiveError.message : "Pesanan gagal diarsipkan");
        } finally {
            setArchiving(false);
        }
    }

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

                      {order && (
                          <div className="border-b border-gray-200 px-6 py-3 dark:border-gray-700">
                              <button type="button" onClick={archiveOrder} disabled={archiving} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                                  {archiving ? "Mengarsipkan..." : "Hapus Pesanan"}
                              </button>
                          </div>
                      )}

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
                                  {(order.courier || order.service || order.biteshipStatus || order.biteshipTrackingId || order.trackingNumber) && (
                                     <div>
                                         <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                                              Pengiriman
                                         </label>
                                         <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                                              Kurir: {order.courier || "-"}<br />
                                              Layanan: {order.service || order.serviceCode || "-"}<br />
                                              Status Pengiriman: {biteshipStatusLabel(order.biteshipStatus)}
                                         </p>
                                          {order.biteshipTrackingId && <p className="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">Tracking ID: {order.biteshipTrackingId}</p>}
                                         {order.trackingNumber && (
                                             <p className="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">
                                                 Resi: {order.trackingNumber}
                                             </p>
                                         )}

                                  {(() => {
                                      const action = kasirShipmentAction({
                                          biteshipOrderId: order.biteshipOrderId,
                                          courierCode: order.courierCode,
                                          serviceCode: order.serviceCode,
                                          destinationAreaId: order.destinationAreaId,
                                          paymentStatus: order.paymentStatus,
                                          orderStatus: order.status,
                                          paymentMethod: order.paymentMethod,
                                          source: order.source,
                                      });
                                      return !hasRealShipment(order.biteshipOrderId) && action.canCreate ? (
                                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-900/20">
                                              <p className="font-semibold text-emerald-900 dark:text-emerald-200">Pengiriman</p>
                                              <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">{order.courier || "-"} · {order.service || order.serviceCode || "-"} · Menunggu Pengiriman</p>
                                              <button type="button" onClick={() => void createShipment()} disabled={creatingShipment} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#123524] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">
                                                  {creatingShipment && <Loader2 className="h-4 w-4 animate-spin" />}
                                                  {creatingShipment ? "Membuat Pengiriman..." : "Buat Pengiriman Biteship"}
                                              </button>
                                          </div>
                                      ) : null;
                                  })()}
                                          {order.biteshipLabelUrl && <a href={order.biteshipLabelUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-emerald-700 underline">Label pengiriman</a>}
                                     </div>
                                 )}
                                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-900/20">
                                       <p className="font-semibold text-emerald-900 dark:text-emerald-200">Foto Penyerahan Paket ke Driver</p>
                                       <p className="mt-1 text-xs text-emerald-800">Foto akan otomatis dikompres hingga maks. 1 MB.</p>
                                       {(handoverFile || order.handoverPhotoUrl) && <div className="relative mt-3 w-fit"><img src={handoverFile ? URL.createObjectURL(handoverFile) : order.handoverPhotoUrl!} alt="Bukti penyerahan ke driver" className="max-h-48 rounded-lg object-cover" />{handoverFile && <button type="button" onClick={() => { setHandoverFile(null); setOriginalHandoverSize(null); }} className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white"><Trash2 size={15} /></button>}</div>}
                                       {handoverFile && <p className="mt-2 text-xs text-emerald-800">Foto asli: {((originalHandoverSize ?? 0) / 1024 / 1024).toFixed(2)} MB · Hasil: {(handoverFile.size / 1024).toFixed(0)} KB</p>}
                                       <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-emerald-400 p-3 text-sm font-semibold text-emerald-900"><Upload size={18} /> {processingHandover ? "Menyiapkan foto..." : handoverFile ? "Ganti Foto" : "Upload Foto Penyerahan ke Driver"}<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={processingHandover || savingHandover} onChange={e => void chooseHandoverFile(e.target.files?.[0])} /></label>
                                      {order.handedOverAt && <p className="mt-2 text-xs text-emerald-800">Diserahkan: {formatDate(order.handedOverAt)}</p>}
                                       {handoverFile && <button type="button" onClick={() => void saveHandover()} disabled={savingHandover || processingHandover} className="mt-3 rounded-lg bg-[#123524] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{savingHandover ? "Menyimpan bukti penyerahan..." : "Konfirmasi Penyerahan ke Driver"}</button>}
                                  </div>

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
                                      {(order.paymentMethod || "").toUpperCase() === "QRIS" && order.paymentStatus.toUpperCase() !== "PAID" && !order.payment?.transactionId && order.payment?.paymentType !== "qris" && (
                                          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-900/20">
                                              <p className="font-semibold text-amber-900 dark:text-amber-200">PEMBAYARAN</p>
                                              <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">Metode: QRIS · Mode: QRIS Manual AFA STORE</p>
                                              <p className="text-sm text-amber-800 dark:text-amber-300">Total Tagihan: {formatRupiah(order.total)}</p>
                                              <button type="button" onClick={confirmPayment} className="mt-3 rounded-lg bg-[#123524] px-4 py-2 text-sm font-bold text-white">Konfirmasi Pembayaran Diterima</button>
                                          </div>
                                      )}
                                      {(order.paymentMethod || "").toUpperCase() === "TUNAI" && order.paymentStatus.toUpperCase() !== "PAID" && (
                                          <button type="button" onClick={confirmPayment} className="rounded-lg bg-[#123524] px-4 py-2 text-sm font-bold text-white">Konfirmasi Uang Diterima</button>
                                      )}
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