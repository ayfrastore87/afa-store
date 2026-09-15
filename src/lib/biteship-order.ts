/*
 * Pure, dependency-free helpers for Phase 2 Biteship order creation.
 * Importable by both the server route and the node:test suite (no `server-only`,
 * no Prisma, no Next imports). Never touches process.env directly — the server
 * route is responsible for reading env and passing values in.
 */

export type BiteshipOriginIdentity = {
    contactName: string;
    contactPhone: string;
    address: string;
    areaId: string;
};

export type BiteshipOrderItem = {
    name: string;
    value: number;
    quantity: number;
    weight: number;
};

export type BiteshipOrderInput = {
    // Server-controlled physical origin. MUST be fully populated before POST.
    origin: BiteshipOriginIdentity;
    // Frozen destination from the Order.
    destination: {
        contactName: string;
        contactPhone: string;
        address: string;
        areaId: string;
        note?: string | null;
    };
    // Frozen courier codes from the server-side revalidated quote.
    courierCode: string;
    serviceCode: string;
    referenceId: string;
    items: BiteshipOrderItem[];
    // Optional dropshipper label-only identity (never changes physical origin).
    senderName?: string | null;
    senderPhone?: string | null;
    hidePrice?: boolean;
};

export type BiteshipCreatedOrder = {
    orderId: string;
    waybillId: string | null;
    trackingId: string | null;
    labelUrl: string | null;
    status: string | null;
    courierCompany: string | null;
    courierType: string | null;
    price: number | null;
};

export const BITESHIP_ORIGIN_INCOMPLETE_MESSAGE = "Konfigurasi pengirim AFA STORE belum lengkap.";

export const BITESHIP_LEGACY_COURIER_MESSAGE = "Kode kurir Biteship belum tersedia untuk pesanan lama ini. Gunakan pengiriman manual.";

/**
 * The physical origin is 100% server-controlled and must be complete before any
 * POST /v1/orders. There is NO fake fallback for name/phone/address/area — if any
 * required field is missing, the caller must refuse the request and return a
 * user-friendly error (never exposing env names to the browser).
 */
export function isOriginIdentityComplete(origin: BiteshipOriginIdentity): boolean {
    return Boolean(origin.contactName.trim() && origin.contactPhone.trim() && origin.address.trim() && origin.areaId.trim());
}

/**
 * A legacy order (created before Phase 2) has courierCode = null. We NEVER guess
 * or map a courier CODE from the display name, so Biteship creation is refused
 * and manual shipping remains the only path.
 */
export function hasCourierCode(value: string | null | undefined): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * Builds the exact POST /v1/orders payload. The physical origin comes only from
 * `input.origin` (server env). `senderName`/`senderPhone` are label-only shipper
 * identity and never overwrite the physical origin. `hidePrice` NEVER zeroes an
 * item value (Biteship rejects value 0); it is intentionally NOT applied to items
 * here — price hiding is handled at the label/invoice level elsewhere.
 */
export function buildBiteshipOrderPayload(input: BiteshipOrderInput): Record<string, unknown> {
    const payload: Record<string, unknown> = {
        origin_contact_name: input.origin.contactName,
        origin_contact_phone: input.origin.contactPhone,
        origin_address: input.origin.address,
        origin_area_id: input.origin.areaId,
        destination_contact_name: input.destination.contactName,
        destination_contact_phone: input.destination.contactPhone,
        destination_address: input.destination.address,
        destination_area_id: input.destination.areaId,
        courier_company: input.courierCode,
        courier_type: input.serviceCode,
        reference_id: input.referenceId,
        items: input.items.map((item) => ({
            name: item.name,
            value: item.value,
            quantity: item.quantity,
            weight: item.weight,
        })),
    };

    if (input.destination.note) payload.destination_note = input.destination.note;

    // Label-only shipper identity (dropship). Optional and non-authoritative.
    if (input.senderName) payload.shipper_contact_name = input.senderName;
    if (input.senderPhone) payload.shipper_contact_phone = input.senderPhone;

    return payload;
}

function readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return null;
}

/**
 * Normalizes the POST /v1/orders success response into the persisted fields.
 * AWB = courier.waybill_id, tracking = courier.tracking_id, label = courier.link.
 */
export function normalizeBiteshipOrderResponse(data: unknown): BiteshipCreatedOrder | null {
    if (typeof data !== "object" || data === null) return null;
    const record = data as Record<string, unknown>;
    const orderId = readString(record.id);
    if (!orderId) return null;

    const courier = (record.courier && typeof record.courier === "object" ? record.courier : {}) as Record<string, unknown>;

    return {
        orderId,
        waybillId: readString(courier.waybill_id) ?? readString(courier.tracking_id),
        trackingId: readString(courier.tracking_id) ?? readString(courier.waybill_id),
        labelUrl: readString(courier.link),
        status: readString(record.status),
        courierCompany: readString(courier.company),
        courierType: readString(courier.type),
        price: readNumber(record.price),
    };
}

/**
 * Detects the official Biteship "reference_id already used" idempotency rejection
 * (code 40002060). Returns the existing order id/waybill when the error payload
 * carries them, so the caller can recover instead of creating a duplicate.
 */
export function isBiteshipReferenceIdConflict(data: unknown): { orderId: string | null; waybillId: string | null } | null {
    if (typeof data !== "object" || data === null) return null;
    const record = data as Record<string, unknown>;
    const code = record.code;
    if (code !== 40002060 && code !== "40002060") return null;
    const details = (record.details && typeof record.details === "object" ? record.details : {}) as Record<string, unknown>;
    return {
        orderId: readString(details.order_id),
        waybillId: readString(details.waybill_id),
    };
}
