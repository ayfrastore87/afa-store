import "server-only";

import {
    hasRealShipment,
    kasirDeliveryTimeline,
    kasirShipmentAction,
    normalizeKasirDeliveryStatus,
    resolveKasirOrderType,
} from "@/lib/kasir-delivery";

// ---------------------------------------------------------------------------
// Shared server-side constants and helpers for the AFA STORE Kasir (POS) API.
//
// The kasir can now create PICKUP or DELIVERY orders. Delivery orders reuse the
// existing Google Maps + Biteship architecture (see src/lib/kasir-delivery.ts) and
// the SAME Order shipping columns as the online checkout — no schema change, no
// second shipping engine.
// ---------------------------------------------------------------------------

export const KASIR_SOURCES = ["TATAP_MUKA", "WHATSAPP"] as const;
export type KasirSource = (typeof KASIR_SOURCES)[number];

// Payment methods accepted by the Kasir API. These match the Kasir UI contract
// (KasirPaymentMethod). TRANSFER and QRIS are persisted with the existing
// canonical Payment.method vocabulary; TUNAI is the cash method backed by the
// Order.cashReceived / Order.change columns already present in the schema.
export const KASIR_PAYMENT_METHODS = ["TUNAI", "TRANSFER", "QRIS"] as const;
export type KasirPaymentMethod = (typeof KASIR_PAYMENT_METHODS)[number];

export const KASIR_PAYMENT_METHOD_CANONICAL: Record<KasirPaymentMethod, string> = {
    TUNAI: "TUNAI",
    TRANSFER: "TRANSFER_BANK",
    QRIS: "QRIS",
};

// Defensive bounds so a single line item can never produce an absurd quantity
// or overflow a monetary computation.
export const MAX_KASIR_QUANTITY = 999;
export const MAX_KASIR_ITEMS = 100;

export function isKasirSource(value: unknown): value is KasirSource {
    return typeof value === "string" && (KASIR_SOURCES as readonly string[]).includes(value);
}

export function isKasirPaymentMethod(value: unknown): value is KasirPaymentMethod {
    return typeof value === "string" && (KASIR_PAYMENT_METHODS as readonly string[]).includes(value);
}

// Structural serialization for a kasir order read (used by GET list + detail).
type KasirOrderItem = {
    id: string;
    name: string;
    quantity: number;
    price: number;
    subtotal: number;
    product: { image: string | null; size: string | null } | null;
};

type KasirOrderRecord = {
    id: string;
    invoice: string;
    customer: string;
    phone: string;
    address: string;
    note: string | null;
    source: string;
    paymentMethod: string;
    paymentStatus: string;
    status: string;
    subtotal: number;
    shipping: number;
    total: number;
    cashReceived: number | null;
    change: number | null;
    createdAt: Date;
    courier: string | null;
    courierCode: string | null;
    service: string | null;
    serviceCode: string | null;
    shippingQuoteRef: string | null;
    destinationAreaId: string | null;
    originAreaId: string | null;
    destinationLatitude: number | null;
    destinationLongitude: number | null;
    destinationProvince: string | null;
    destinationCity: string | null;
    destinationDistrict: string | null;
    destinationVillage: string | null;
    destinationPostalCode: string | null;
    biteshipOrderId: string | null;
    biteshipStatus: string | null;
    biteshipTrackingId: string | null;
    biteshipLabelUrl: string | null;
    trackingNumber: string | null;
    /**
     * Persisted order-row timestamp. The tracking sync writes THIS row in place, so
     * the card can show when the shipment state was last stored. No new column.
     */
    updatedAt: Date;
    payment: { status: string; method: string; paymentType?: string | null; qrisUrl?: string | null; expiredAt?: Date | null; transactionRef?: string | null; transactionId?: string | null } | null;
    items: KasirOrderItem[];
};

/**
 * Persisted shipment state a tracking refresh may return, derived with the SAME pure
 * helpers as `formatKasirOrder` so the cashier UI can apply a successful sync WITHOUT
 * re-reading the whole transaction.
 *
 * It is a strict SUBSET of the delivery block the detail route already returns: no
 * internal identifier (provider order id, area id, quote ref, coordinates) and no raw
 * provider payload is ever part of it.
 */
export type KasirShipmentSyncRecord = {
    biteshipOrderId: string | null;
    biteshipStatus: string | null;
    biteshipTrackingId: string | null;
    biteshipLabelUrl: string | null;
    trackingNumber: string | null;
    updatedAt: Date;
};

export function kasirShipmentSyncView(order: KasirShipmentSyncRecord) {
    const hasShipment = hasRealShipment(order.biteshipOrderId);
    return {
        status: normalizeKasirDeliveryStatus({ biteshipStatus: order.biteshipStatus, hasShipment }),
        // Timeline tetap diturunkan server-side dari status provider TERSIMPAN, jadi
        // hasil sinkronisasi tidak pernah mendahului provider dan tidak pernah mundur.
        timeline: kasirDeliveryTimeline({ biteshipStatus: order.biteshipStatus, hasShipment }),
        hasShipment,
        trackingId: order.biteshipTrackingId || order.trackingNumber || null,
        labelUrl: order.biteshipLabelUrl,
        lastUpdatedAt: order.updatedAt,
        shipmentAction: kasirShipmentAction({
            biteshipOrderId: order.biteshipOrderId,
            courierCode: "", // Not available in sync view
            serviceCode: "", // Not available in sync view
            destinationAreaId: "", // Not available in sync view
            paymentStatus: "", // Not available in sync view
            orderStatus: "", // Not available in sync view
            paymentMethod: "", // Not available in sync view
            source: "", // Not available in sync view
            orderType: "DELIVERY", // Assume delivery for shipment sync
        }),
    };
}

export function formatKasirOrder(order: KasirOrderRecord) {
    const orderType = resolveKasirOrderType(order);
    const paymentStatus = order.payment?.status ?? order.paymentStatus;
    const hasShipment = hasRealShipment(order.biteshipOrderId);
    const shipmentAction = kasirShipmentAction({
        biteshipOrderId: order.biteshipOrderId,
        courierCode: order.courierCode,
        serviceCode: order.serviceCode,
        destinationAreaId: order.destinationAreaId,
        paymentStatus,
        orderStatus: order.status,
        paymentMethod: order.paymentMethod,
        source: order.source,
        orderType: resolveKasirOrderType(order),
    });

    // Internal identifiers (destinationAreaId, originAreaId, shippingQuoteRef, the Biteship
    // order id, provider codes and coordinates) are deliberately NOT part of this payload:
    // they must never reach the browser UI — or a printed struk.
    const delivery =
        orderType === "DELIVERY"
            ? {
                  recipientName: order.customer,
                  recipientPhone: order.phone,
                  address: order.address,
                  note: order.note,
                  shipping: order.shipping,
                  courier: order.courier,
                  service: order.service,
                  status: normalizeKasirDeliveryStatus({ biteshipStatus: order.biteshipStatus, hasShipment }),
                  // Timeline pengiriman, diturunkan dari status provider yang TERSIMPAN
                  // (aturan murni di src/lib/kasir-delivery.ts). Tidak ada tahap yang
                  // dikarang di browser: status tak dikenal tidak pernah menjadi "Terkirim".
                  timeline: kasirDeliveryTimeline({ biteshipStatus: order.biteshipStatus, hasShipment }),
                  hasShipment,
                  trackingId: order.biteshipTrackingId || order.trackingNumber || null,
                  labelUrl: order.biteshipLabelUrl,
                  // "Terakhir Diperbarui": the persisted order-row timestamp, which the
                  // existing tracking sync updates in place when the provider state changes.
                  lastUpdatedAt: order.updatedAt,
                  shipmentAction,
                  destination: {
                      province: order.destinationProvince,
                      city: order.destinationCity,
                      district: order.destinationDistrict,
                      village: order.destinationVillage,
                      postalCode: order.destinationPostalCode,
                  },
              }
            : null;

    return {
        id: order.id,
        invoice: order.invoice,
        customer: order.customer,
        phone: order.phone,
        source: order.source,
        paymentMethod: order.paymentMethod,
        paymentStatus,
        status: order.status,
        subtotal: order.subtotal,
        // A pickup order never exposes a shipping amount (it is always 0 anyway).
        shipping: orderType === "DELIVERY" ? order.shipping : 0,
        total: order.total,
        cashReceived: order.cashReceived,
        change: order.change,
        createdAt: order.createdAt,
        orderType,
        // QRIS display data — exposed only when Payment has QRIS fields
        ...order.payment && (order.payment.qrisUrl || order.payment.expiredAt) && {
            payment: {
                method: order.payment.method,
                status: order.payment.status,
                paymentType: order.payment.paymentType || undefined,
                qrisUrl: order.payment.qrisUrl || undefined,
                expiredAt: order.payment.expiredAt || undefined,
            }
        },
        delivery,
        items: order.items.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            subtotal: item.subtotal,
            size: item.product?.size ?? null,
            image: item.product?.image ?? null,
        })),
    };
}
