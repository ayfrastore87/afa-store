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
