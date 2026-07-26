import crypto from "crypto";

const isProduction = process.env.MIDTRANS_IS_PRODUCTION === "true";
const baseUrl = isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";

export type MidtransChargeItem = {
    id: string;
    price: number;
    quantity: number;
    name: string;
};

export type MidtransChargePayload = {
    invoice: string;
    amount: number;
    customer: {
        name: string;
        email?: string | null;
        phone?: string | null;
    };
    items: MidtransChargeItem[];
    expiryMinutes?: number;
};

export type MidtransChargeResponse = {
    transaction_id?: string;
    order_id?: string;
    gross_amount?: string;
    payment_type?: string;
    transaction_status?: string;
    expiry_time?: string;
    actions?: { name?: string; method?: string; url?: string }[];
    status_code?: string;
    status_message?: string;
};

export function getMidtransConfig() {
    const serverKey = process.env.MIDTRANS_SERVER_KEY;
    if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY belum diisi.");
    return { serverKey, baseUrl, isProduction };
}

export function getMidtransAuthHeader() {
    const { serverKey } = getMidtransConfig();
    return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

export function getQrisActionUrl(response: MidtransChargeResponse) {
    return response.actions?.find((action) => action.name === "generate-qr-code")?.url ?? response.actions?.find((action) => action.url)?.url ?? null;
}

export async function createMidtransQrisCharge(payload: MidtransChargePayload) {
    const response = await fetch(`${baseUrl}/v2/charge`, {
        method: "POST",
        headers: {
            Accept: "application/json",
            Authorization: getMidtransAuthHeader(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            payment_type: "qris",
            transaction_details: {
                order_id: payload.invoice,
                gross_amount: payload.amount,
            },
            item_details: payload.items.map((item) => ({
                id: item.id.slice(0, 50),
                price: item.price,
                quantity: item.quantity,
                name: item.name.slice(0, 50),
            })),
            customer_details: {
                first_name: payload.customer.name,
                email: payload.customer.email || undefined,
                phone: payload.customer.phone || undefined,
            },
            custom_expiry: {
                expiry_duration: payload.expiryMinutes ?? 60,
                unit: "minute",
            },
        }),
    });

    const data = (await response.json()) as MidtransChargeResponse;
    if (!response.ok) {
        throw new Error(data.status_message || "Gagal membuat transaksi Midtrans.");
    }
    return data;
}

export function verifyMidtransSignature(notification: { order_id?: string; status_code?: string; gross_amount?: string; signature_key?: string }) {
    const { serverKey } = getMidtransConfig();
    if (!notification.signature_key || !notification.order_id || !notification.status_code || !notification.gross_amount) return false;
    const hash = crypto.createHash("sha512").update(`${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`).digest("hex");
    return hash === notification.signature_key;
}
