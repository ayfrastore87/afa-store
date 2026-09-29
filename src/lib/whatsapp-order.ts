import { formatRupiah } from "@/lib/products";
import { SITE_URL } from "@/lib/site-url";

const AFA_STORE_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "";

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

/**
 * Build a WhatsApp deep-link for a product order message.
 *
 * @param product    - Product to include in the message body.
 * @param quantity   - Quantity (default: 1).
 * @param phoneNumber - Optional store WhatsApp number (E.164 or local format).
 *                      Digits are extracted; falls back to AFA_STORE_WHATSAPP_NUMBER.
 */
export function buildWhatsAppOrderUrl(
    product: WhatsAppOrderProduct,
    quantity = 1,
    phoneNumber?: string,
) {
    const digits = phoneNumber?.replace(/\D/g, "") || "";
    const wa = digits || AFA_STORE_WHATSAPP_NUMBER.replace(/\D/g, "");
    if (!wa) return "";
    return `https://wa.me/${wa}?text=${encodeURIComponent(buildWhatsAppOrderMessage(product, quantity))}`;
}

export function openWhatsAppOrder(
    product: WhatsAppOrderProduct,
    quantity = 1,
    phoneNumber?: string,
) {
    window.open(buildWhatsAppOrderUrl(product, quantity, phoneNumber), "_blank", "noopener,noreferrer");
}

export type { WhatsAppOrderProduct };

export default buildWhatsAppOrderUrl;
