import Swal from "sweetalert2";

import { hasAuthenticatedUser, loginPath } from "@/lib/client-auth";
import type { WhatsAppOrderProduct } from "@/lib/whatsapp-order";
import { buildWhatsAppOrderUrl } from "@/lib/whatsapp-order";

export async function confirmCustomerAuth(kind: "wishlist" | "cart", next: string) {
    if (await hasAuthenticatedUser()) return true;

    const wishlist = kind === "wishlist";
    const result = await Swal.fire({
        title: wishlist ? "Login untuk menggunakan Wishlist" : "Login untuk melihat Keranjang",
        text: wishlist
            ? "Simpan produk favorit Anda dengan masuk atau membuat akun AFA STORE."
            : "Masuk atau buat akun AFA STORE untuk melihat keranjang Anda.",
        showCancelButton: true,
        cancelButtonText: "Nanti",
        confirmButtonText: "Login / Daftar",
        reverseButtons: true,
        focusCancel: true,
        confirmButtonColor: "#123524",
        cancelButtonColor: "#E8E1D4",
        customClass: {
            cancelButton: "!text-[#123524]",
        },
    });

    if (result.isConfirmed) {
        window.location.assign(loginPath(next));
    }

    return false;
}

export async function chooseGuestCartAction(productUrl: string, product: WhatsAppOrderProduct, quantity = 1) {
    const whatsappUrl = buildWhatsAppOrderUrl(product, quantity);
    const result = await Swal.fire({
        title: "Pesan Produk AFA STORE",
        text: "Pilih cara melanjutkan pesanan Anda.",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: "Pesan via WhatsApp",
        denyButtonText: "Login / Daftar",
        cancelButtonText: "Nanti",
        reverseButtons: true,
        focusCancel: true,
        confirmButtonColor: "#25D366",
        denyButtonColor: "#123524",
        cancelButtonColor: "#E8E1D4",
        customClass: { cancelButton: "!text-[#123524]" },
    });
    if (result.isConfirmed && whatsappUrl) window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    if (result.isDenied) window.location.assign(loginPath(productUrl));
    return result.isConfirmed || result.isDenied;
}
