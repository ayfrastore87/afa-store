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
    transaction_id?: string;
    order_id?: string;
    gross_amount?: string;
    payment_type?: string;
    transaction_status?: string;
    expiry_time?: string;
    actions?: { name?: string; method?: string; url?: string }[];
    qr_string?: string;
    qrString?: string;
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
    const baseUrl = isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";

    return { serverKey, merchantId, isProduction, baseUrl };
}

export function getMidtransAuthHeader() {
    const { serverKey } = getMidtransConfig();
    return `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`;
}

export function getQrisActionUrl(response: MidtransChargeResponse) {
    return response.actions?.find((action) => action.name === "generate-qr-code")?.url ?? response.actions?.find((action) => action.url)?.url ?? null;
}

export function getQrisString(response: MidtransChargeResponse) {
    return response.qr_string ?? response.qrString ?? null;
}

export async function createMidtransQrisCharge(payload: MidtransChargePayload) {
    const { baseUrl } = getMidtransConfig();
    const endpoint = `${baseUrl}/v2/charge`;
    const grossAmount = payload.amount;
    const itemDetails = payload.items.map((item) => ({
        id: item.id.slice(0, 50),
        price: item.price,
        quantity: item.quantity,
        name: item.name.slice(0, 50),
    }));
    const totalItemDetails = itemDetails.reduce((sum, item) => sum + item.price * item.quantity, 0);

    if (grossAmount !== totalItemDetails) {
        throw new Error(`Midtrans payload invalid: gross_amount ${grossAmount} tidak sama dengan total item_details ${totalItemDetails}.`);
    }

    const chargePayload = {
        payment_type: "qris",
        transaction_details: {
            order_id: payload.invoice,
            gross_amount: grossAmount,
        },
        item_details: itemDetails,
        customer_details: {
            first_name: payload.customer.name,
            email: payload.customer.email || undefined,
            phone: payload.customer.phone || undefined,
        },
        qris: {},
    };

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Accept: "application/json",
            Authorization: getMidtransAuthHeader(),
            "Content-Type": "application/json",
        },
        body: JSON.stringify(chargePayload),
    });

    const text = await response.text();

    if (!response.ok) {
        console.error("Midtrans request failed", { status: response.status });
    }

    let data: MidtransChargeResponse;
    try {
        data = JSON.parse(text) as MidtransChargeResponse;
    } catch {
        throw new Error("Midtrans returned an invalid response.");
    }

    const statusMessage = data.status_message || text;
    if (!response.ok) {
        if (statusMessage.toLowerCase().includes("unknown merchant")) {
            throw new Error(UNKNOWN_MERCHANT_MESSAGE);
        }
        throw new Error(`Midtrans request failed with status ${response.status}.`);
    }

    return data;
}

export function verifyMidtransSignature(notification: {
    order_id?: string;
    status_code?: string;
    gross_amount?: string;
    signature_key?: string;
}) {
    const { serverKey } = getMidtransConfig();

    if (
        !notification.signature_key ||
        !notification.order_id ||
        !notification.status_code ||
        !notification.gross_amount
    ) {
        return false;
    }

    const hash = crypto
        .createHash("sha512")
        .update(
            `${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`
        )
        .digest("hex");

    return hash === notification.signature_key;
}
