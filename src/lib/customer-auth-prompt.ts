import Swal from "sweetalert2";

import { hasAuthenticatedUser, loginPath } from "@/lib/client-auth";

export async function confirmCustomerAuth(kind: "wishlist" | "cart", next: string) {
    if (await hasAuthenticatedUser()) return true;

    const wishlist = kind === "wishlist";
    const result = await Swal.fire({
        title: wishlist ? "Login untuk menggunakan Wishlist" : "Login untuk menggunakan Keranjang",
        text: wishlist
            ? "Simpan produk favorit Anda dengan masuk atau membuat akun AFA STORE."
            : "Masuk atau buat akun AFA STORE untuk menyimpan produk ke keranjang.",
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

export async function chooseGuestCartAction(productUrl: string, whatsappUrl: string) {
    const result = await Swal.fire({
        title: "Pilih cara berbelanja",
        text: "Anda dapat memesan melalui WhatsApp tanpa membuat akun, atau masuk untuk menyimpan keranjang.",
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: "WhatsApp tanpa registrasi",
        denyButtonText: "Login / Daftar",
        cancelButtonText: "Nanti",
        reverseButtons: true,
        focusCancel: true,
        confirmButtonColor: "#25D366",
        denyButtonColor: "#123524",
        cancelButtonColor: "#E8E1D4",
        customClass: { cancelButton: "!text-[#123524]" },
    });
    if (result.isConfirmed) window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    if (result.isDenied) window.location.assign(loginPath(productUrl));
    return result.isConfirmed || result.isDenied;
}
