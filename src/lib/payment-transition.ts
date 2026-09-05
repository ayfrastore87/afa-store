export type PaymentState = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
export type FulfillmentState = "PENDING" | "PROCESSING" | "PACKED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
export type PaymentEvent = "settlement" | "capture_accept" | "expire" | "cancel" | "deny";

export type TransitionResult = {
    paymentStatus: PaymentState;
    orderPaymentStatus: PaymentState;
    orderStatus: FulfillmentState;
    mutationAllowed: boolean;
    duplicate: boolean;
    reconciliationRequired: boolean;
    action: "payment_paid" | "payment_expired" | "payment_cancelled" | "duplicate_webhook" | "late_webhook";
};

export function paymentTransition(payment: PaymentState, order: FulfillmentState, event: PaymentEvent): TransitionResult {
    const paid = event === "settlement" || event === "capture_accept";
    if (paid && payment !== "PENDING") return { paymentStatus: payment, orderPaymentStatus: payment, orderStatus: order, mutationAllowed: false, duplicate: payment === "PAID", reconciliationRequired: payment !== "PAID", action: payment === "PAID" ? "duplicate_webhook" : "late_webhook" };
    if (!paid && payment === "PAID") return { paymentStatus: payment, orderPaymentStatus: payment, orderStatus: order, mutationAllowed: false, duplicate: false, reconciliationRequired: true, action: "late_webhook" };
    if (event === "expire" && payment === "EXPIRED") return { paymentStatus: payment, orderPaymentStatus: payment, orderStatus: order, mutationAllowed: false, duplicate: true, reconciliationRequired: false, action: "duplicate_webhook" };
    if ((event === "cancel" || event === "deny") && payment === "CANCELLED") return { paymentStatus: payment, orderPaymentStatus: payment, orderStatus: order, mutationAllowed: false, duplicate: true, reconciliationRequired: false, action: "duplicate_webhook" };
    if (payment !== "PENDING") return { paymentStatus: payment, orderPaymentStatus: payment, orderStatus: order, mutationAllowed: false, duplicate: false, reconciliationRequired: true, action: "late_webhook" };
    if (paid) return { paymentStatus: "PAID", orderPaymentStatus: "PAID", orderStatus: order === "PENDING" ? "PROCESSING" : order, mutationAllowed: true, duplicate: false, reconciliationRequired: false, action: "payment_paid" };
    if (event === "expire") return { paymentStatus: "EXPIRED", orderPaymentStatus: "EXPIRED", orderStatus: order, mutationAllowed: payment === "PENDING", duplicate: false, reconciliationRequired: false, action: "payment_expired" };
    return { paymentStatus: "CANCELLED", orderPaymentStatus: "CANCELLED", orderStatus: order, mutationAllowed: true, duplicate: false, reconciliationRequired: false, action: "payment_cancelled" };
}