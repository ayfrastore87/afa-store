import crypto from "crypto";

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
    token?: string;
    redirect_url?: string;
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

type MidtransConfig = {
    serverKey: string;
    merchantId: string;
    isProduction: boolean;
    baseUrl: string;
};

const UNKNOWN_MERCHANT_MESSAGE = "Server Key atau Merchant ID tidak cocok dengan environment Sandbox/Production.";

export function getMidtransConfig(): MidtransConfig {
    const serverKey = process.env.MIDTRANS_SERVER_KEY?.trim();
    const merchantId = process.env.MIDTRANS_MERCHANT_ID?.trim();
    const productionFlag = process.env.MIDTRANS_IS_PRODUCTION?.trim();

    if (!serverKey) throw new Error("MIDTRANS_SERVER_KEY missing");
    if (!merchantId) throw new Error("MIDTRANS_MERCHANT_ID missing");
    if (!productionFlag) throw new Error("MIDTRANS_IS_PRODUCTION missing");

    const isProduction = productionFlag === "true";
    const baseUrl = isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";

    console.log({
        baseUrl,
        merchantId: process.env.MIDTRANS_MERCHANT_ID,
        isProduction,
        serverKeyPrefix: process.env.MIDTRANS_SERVER_KEY?.substring(0, 15),
    });

    return { serverKey, merchantId, isProduction, baseUrl };
}

export function getMidtransAuthHeader() {
    const { serverKey } = getMidtransConfig();
    return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

export function getQrisActionUrl(response: MidtransChargeResponse) {
    return response.redirect_url ?? response.actions?.find((action) => action.name === "generate-qr-code")?.url ?? response.actions?.find((action) => action.url)?.url ?? null;
}

export async function createMidtransQrisCharge(payload: MidtransChargePayload) {
    const { baseUrl, merchantId, isProduction } = getMidtransConfig();
    const endpoint = `${baseUrl}/snap/v1/transactions`;

    console.log({
        orderId: payload.invoice,
        grossAmount: payload.amount,
        merchantId,
        environment: isProduction ? "production" : "sandbox",
        midtransEndpoint: endpoint,
    });

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Accept: "application/json",
            Authorization: getMidtransAuthHeader(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            enabled_payments: ["qris"],
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
            expiry: {
                duration: payload.expiryMinutes ?? 60,
                unit: "minute",
            },
        }),
    });

    const text = await response.text();

    if (!response.ok) {
        console.error({ status: response.status, body: text });
    }

    let data: MidtransChargeResponse;
    try {
        data = JSON.parse(text) as MidtransChargeResponse;
    } catch {
        throw new Error(text);
    }

    const statusMessage = data.status_message || text;
    if (!response.ok) {
        if (statusMessage.toLowerCase().includes("unknown merchant")) {
            throw new Error(UNKNOWN_MERCHANT_MESSAGE);
        }
        throw new Error(`Midtrans error ${response.status}: ${statusMessage}\n${text}`);
    }

    return data;
}

export function verifyMidtransSignature(notification: { order_id?: string; status_code?: string; gross_amount?: string; signature_key?: string }) {
    const { serverKey } = getMidtransConfig();
    if (!notification.signature_key || !notification.order_id || !notification.status_code || !notification.gross_amount) return false;
    const hash = crypto.createHash("sha512").update(`${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`).digest("hex");
    return hash === notification.signature_key;
}
