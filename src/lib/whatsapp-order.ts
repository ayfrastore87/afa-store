import { formatRupiah } from "@/lib/products";
import { SITE_URL } from "@/lib/site-url";

export const AFA_STORE_WHATSAPP_NUMBER = "6287770000883";

type WhatsAppOrderProduct = {
    name: string;
    slug: string;
    price: number;
    size?: string | null;
    flavor?: string | null;
};

export function buildWhatsAppOrderMessage(product: WhatsAppOrderProduct, quantity = 1) {
    const safeQuantity = Math.max(1, Math.floor(quantity));
    const lines = [
        "Halo AFA STORE 👋",
        "",
        "Saya ingin memesan:",
        "",
        `Produk: ${product.name}`,
        ...(product.size ? [`Ukuran: ${product.size}`] : []),
        ...(product.flavor ? [`Rasa: ${product.flavor}`] : []),
        `Harga Satuan: ${formatRupiah(product.price)}`,
        `Jumlah: ${safeQuantity}`,
        `Subtotal: ${formatRupiah(product.price * safeQuantity)}`,
        "",
        "Link Produk:",
        `${SITE_URL}/produk/${product.slug}`,
        "",
        "Mohon dibantu proses pesanannya. Terima kasih.",
    ];
    return lines.join("\n");
}

export function buildWhatsAppOrderUrl(product: WhatsAppOrderProduct, quantity = 1) {
    return `https://wa.me/${AFA_STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(buildWhatsAppOrderMessage(product, quantity))}`;
}

export function openWhatsAppOrder(product: WhatsAppOrderProduct, quantity = 1) {
    window.open(buildWhatsAppOrderUrl(product, quantity), "_blank", "noopener,noreferrer");
}

export type { WhatsAppOrderProduct };

export default buildWhatsAppOrderUrl;
