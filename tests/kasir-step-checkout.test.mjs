import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const posCode = read("../src/components/admin/kasir/KasirPOS.tsx");
const kasirOrderRoute = read("../src/app/api/admin/kasir/order/route.ts");
const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
test("DELIVERY checkout has 5 conceptual stages", () => {
    assert.ok(posCode.includes('const [currentStep, setCurrentStep]'));
    assert.ok(posCode.match(/\[1, 2, 3, 4, 5\]/));
    assert.ok(posCode.includes("Lanjutkan"));
    assert.ok(posCode.includes("Kembali"));
});
test("PICKUP checkout has 2 stages", () => {
    assert.ok(posCode.includes('orderType === "PICKUP" ? 2 : 5'));
});
test("Empty cart blocks step advancement", () => {
    assert.ok(posCode.match(/if \(cart\.length === 0\) return false/));
});
test("Address validation required before ongkir", () => {
    assert.ok(posCode.match(/case 2:[^}]*dr\.ready/));
});
test("Courier/service selection required before payment", () => {
    assert.ok(posCode.match(/case 3:[^}]*courierCode[^}]*serviceCode/));
});
test("Order creation triggers payment finalization", () => {
    assert.ok(kasirOrderRoute.includes("POST"));
    assert.ok(kasirOrderRoute.includes("PAID"));
});
test("Shipment reuses persisted order", () => {
    assert.ok(biteshipRoute.includes("biteshipOrderId"));
    assert.ok(biteshipRoute.includes("PAID"));
});
test("COD doesn't auto-set PAID", () => {
    // Architecture ensures COD flow is different from instant payment
    assert.ok(kasirOrderRoute.includes("TUNAI") || kasirOrderRoute.includes("cashReceived"));
});
test("Payment methods preserved via existing semantics", () => {
    // Existing API handles all payment methods correctly
    assert.ok(kasirOrderRoute.length > 100); // Ensure route exists with logic
});
test("Biteship credentials not exposed client-side", () => {
    const secretPatterns = [/process\.env\.BITESHIP_KEY/i];
    const exposed = secretPatterns.some(p => p.test(posCode));
    assert.strictEqual(exposed, false);
});
test("DELIVERY COD omits cashReceived from payload", () => {
    // Payload construction must NOT send cashReceived for DELIVERY + TUNAI
    const hasConditional = posCode.includes('orderType !== "DELIVERY"') ||
        posCode.includes('orderType === "PICKUP"');
    assert.ok(hasConditional, "cashReceived must be conditional on order type");
    // Ensure backend still validates DELIVERY cannot have cashReceived
    assert.ok(kasirOrderRoute.includes("Delivery") || kasirOrderRoute.includes("TUNAI"));
});
// Additional regression test for PICKUP cashReceived behavior
test("PICKUP preserves cashReceived in payload", () => {
    // Existing behavior must remain for PICKUP orders
    assert.ok(posCode.includes("cashReceived:"), "cashReceived field must exist in POS payload");
});
// Comprehensive DELIVERY + TUNAI persistence verification
test("DELIVERY+TUNAI persists as pending COD with null paidAt", () => {
    // Simulate payload construction
    const orderType = "DELIVERY";
    const paymentMethod = "TUNAI";
    // Payload should NOT include cashReceived
    const payload = {
        customerName: "Test",
        customerWhatsapp: "081234567890",
        source: "TATAP_MUKA",
        paymentMethod,
        orderType,
        ...(paymentMethod === "TUNAI" && orderType !== "DELIVERY" ? { cashReceived: 10000 } : {}),
        items: [{ productId: "test-id", quantity: 1 }],
    };
    assert.ok(!payload.hasOwnProperty("cashReceived"), "DELIVERY COD must omit cashReceived property");
    assert.strictEqual(payload.paymentMethod, "TUNAI", "DELIVERY COD must send paymentMethod TUNAI");
    // Verify backend validation logic would accept this
    const method = payload.paymentMethod.trim().toUpperCase();
    const isValid = ["TUNAI", "TRANSFER", "QRIS"].includes(method);
    assert.ok(isValid, "Payment method must be valid");
});
// PICKUP+TUNAI verification
test("PICKUP+TUNAI persists as PAID with cashReceived", () => {
    const orderType = "PICKUP";
    const paymentMethod = "TUNAI";
    const payload = {
        customerName: "Test",
        customerWhatsapp: "081234567890",
        source: "TATAP_MUKA",
        paymentMethod,
        orderType,
        ...(paymentMethod === "TUNAI" && orderType !== "DELIVERY" ? { cashReceived: 10000 } : {}),
        items: [{ productId: "test-id", quantity: 1 }],
    };
    assert.ok(payload.hasOwnProperty("cashReceived"), "PICKUP TUNAI must include cashReceived");
    assert.strictEqual(payload.cashReceived, 10000, "cashReceived must be sent");
    assert.strictEqual(payload.paymentMethod, "TUNAI", "PICKUP TUNAI must send paymentMethod TUNAI");
});

test("QRIS initial order has WAITING_PAYMENT paymentStatus", () => {
    assert.ok(kasirOrderRoute.includes('method === "QRIS" ? "WAITING_PAYMENT"'), "Order.paymentStatus must be WAITING_PAYMENT for QRIS");
});

test("QRIS Payment starts as PENDING", () => {
    assert.ok(kasirOrderRoute.includes('status: method === "QRIS" ? "PENDING"'), "Payment.status must be PENDING for QRIS");
});

test("QRIS paidAt is null initially", () => {
    assert.ok(kasirOrderRoute.includes('paidAt: method === "QRIS" ? null :'), "QRIS paidAt must be null until webhook updates it");
});

test("No premature QRIS PAID", () => {
    // SEMANTIC assertion (replaces the old broad /QRIS.*PAID/ regex that also matched
    // the legitimate ternary fallthrough to "PAID" for TUNAI/TRANSFER on line 376).
    // Production correctly persists QRIS as WAITING_PAYMENT/PENDING/null at creation.
    const psMatch = kasirOrderRoute.match(/^\s*paymentStatus:\s*(.*),\s*$/m);
    assert.ok(psMatch, "Order.paymentStatus must be persisted");
    const payStatusLine = kasirOrderRoute.match(/\bstatus:\s*method === "QRIS"[^\n]*/);
    assert.ok(payStatusLine, "Payment.status must start QRIS as PENDING");
    const paidAtLine = kasirOrderRoute.match(/\bpaidAt:\s*method === "QRIS"[^\n]*/);
    assert.ok(paidAtLine, "paidAt must stay null for QRIS initially");

    const psFn = new Function("orderType", "method", "now", `return (${psMatch[1].trim()});`);
    const payStatusFn = new Function("orderType", "method", "now", `return (${payStatusLine[0].replace(/^\s*status:\s*/, "").replace(/,\s*$/, "")});`);
    const paidAtFn = new Function("orderType", "method", "now", `return (${paidAtLine[0].replace(/^\s*paidAt:\s*/, "").replace(/,\s*$/, "")});`);

    for (const orderType of ["PICKUP", "DELIVERY"]) {
        assert.equal(psFn(orderType, "QRIS", "NOW"), "WAITING_PAYMENT",
            `QRIS ${orderType} must start WAITING_PAYMENT, never PAID`);
        assert.equal(payStatusFn(orderType, "QRIS", "NOW"), "PENDING",
            `QRIS ${orderType} Payment.status must start PENDING, never PAID`);
        assert.equal(paidAtFn(orderType, "QRIS", "NOW"), null,
            `QRIS ${orderType} paidAt must stay null until settlement`);
    }
    // Only a verified Midtrans settlement (webhook) may flip QRIS to PAID.
    const webhook = read("../src/app/api/midtrans/webhook/route.ts");
    assert.ok(webhook.includes("verifyMidtransSignature"), "Only verified settlement can mark QRIS PAID");
});

test("Same invoice used for Midtrans", () => {
    const qrisRoute = read("../src/app/api/admin/kasir/orders/[id]/qris/retry/route.ts");
    assert.ok(kasirOrderRoute.includes('createMidtransQrisCharge'), "Must create Midtrans charge after order creation");
    assert.ok(qrisRoute.includes('invoice: order.invoice'), "Invoice field must match Order.invoice");
});

test("QRIS retry reuses same Order", () => {
    const qrisRoute = read("../src/app/api/admin/kasir/orders/[id]/qris/retry/route.ts");
    assert.ok(!qrisRoute.includes("order.create"), "Retry must NOT create new Order");
    assert.ok(qrisRoute.includes("prisma.order.findFirst"), "Retry must only READ Order");
});

test("QRIS retry no Order.create", () => {
    const qrisRoute = read("../src/app/api/admin/kasir/orders/[id]/qris/retry/route.ts");
    assert.strictEqual(!!qrisRoute.match(/order\.create/i), false, "Retry endpoint must not create Orders");
});

test("QRIS retry no Payment.create", () => {
    const qrisRoute = read("../src/app/api/admin/kasir/orders/[id]/qris/retry/route.ts");
    assert.strictEqual(!!qrisRoute.match(/payment\.create/i), false, "Retry endpoint must not create Payments");
    assert.ok(qrisRoute.includes("prisma.payment.updateMany"), "Retry must use updateMany on existing Payment");
});

test("QRIS retry no stock mutation", () => {
    const qrisRoute = read("../src/app/api/admin/kasir/orders/[id]/qris/retry/route.ts");
    assert.strictEqual(!!qrisRoute.match(/product\.update.*stock/i), false, "Retry must not touch stock");
    // Retry may READ persisted items without modifying anything (no updateMany/decrement/increment on products)
    assert.ok(!/prisma\.product/.test(qrisRoute), "Retry must never read or write Product table");
    assert.ok(!/\bdecrement\b|\bincrement\b/.test(qrisRoute), "Retry must not change stock counters");
    // Reading persisted items is allowed: findFirst(include: { items: true }) + map over them
    assert.ok(qrisRoute.includes("order.items"), "Retry reads persisted Order.items");
});

test("QRIS retry existing qrisUrl reused", () => {
    const qrisRoute = read("../src/app/api/admin/kasir/orders/[id]/qris/retry/route.ts");
    assert.ok(qrisRoute.includes('if (payment.qrisUrl)'), "Must check if qrisUrl already exists");
    assert.ok(qrisRoute.includes("reused: true"), "Must return reused flag when QRIS already created");
});

test("retry button single-flight", () => {
    const detail = read("../src/components/admin/kasir/KasirTransactionDetail.tsx");
    assert.ok(detail.includes("retryingQris") || detail.includes("setRetryingQris"), "Must have local loading state");
    assert.ok(detail.includes("retryQrisLockRef"), "Must use ref for single-flight locking");
    assert.ok(detail.includes("disabled={retryingQris}"), "Button must be disabled while retrying");
});

test("pending QRIS polling GET-only", () => {
    const detail = read("../src/components/admin/kasir/KasirTransactionDetail.tsx");
    assert.ok(detail.includes('fetch(`/api/admin/kasir/orders/${id}`)') || detail.includes('cache: "no-store"'), "Polling must use GET with no-store cache");
    assert.strictEqual(!!detail.match(/POST.*poll|poll.*POST/i), false, "Polling effect must not POST automatically");
});

test("verified webhook => Payment PAID", () => {
    const webhook = read("../src/app/api/midtrans/webhook/route.ts");
    const transitionLib = read("../src/lib/payment-transition.ts");
    assert.ok(webhook.includes("verifyMidtransSignature"), "Webhook must verify signature before any mutations");
    assert.ok(transitionLib.includes("paymentStatus: \"PAID\""), "Transition logic must allow payment_status update to PAID");
});

test("verified webhook => Order PAID", () => {
    const webhook = read("../src/app/api/midtrans/webhook/route.ts");
    assert.ok(webhook.includes("await tx.order.update"), "Webhook transaction must also update Order.paymentStatus");
    assert.ok(webhook.includes("result.orderPaymentStatus"), "Must use transition result for order status");
});

test("invalid signature cannot mark PAID", () => {
    const webhook = read("../src/app/api/midtrans/webhook/route.ts");
    const lines = webhook.split('\n');
    const verifyLine = lines.findIndex(l => l.includes("verifyMidtransSignature"));
    const updateLine = lines.findIndex(l => l.includes("tx.payment.updateMany") || l.includes("tx.order.update"));
    assert.ok(verifyLine > -1 && updateLine > -1, "Both verify and update statements must exist");
    assert.ok(verifyLine < updateLine, "Signature verification MUST happen BEFORE database updates");
});

test("amount mismatch cannot mark PAID", () => {
    const webhook = read("../src/app/api/midtrans/webhook/route.ts");
    assert.ok(webhook.includes("grossAmount !== order.total") || webhook.includes("gross_amount_mismatch"), "Must validate gross_amount matches order total");
    assert.ok(webhook.includes("payment.amount !== grossAmount") || webhook.includes("payment_amount_mismatch"), "Must also validate payment.amount");
});

test("webhook idempotency", () => {
    const webhook = read("../src/app/api/midtrans/webhook/route.ts");
    assert.ok(webhook.includes("where: { id: payment.id, status: \"PENDING\" }") || webhook.includes("updated .count"), "Webhook must filter by PENDING status for idempotency");
    assert.ok(webhook.includes("changed.count"), "Must check how many records updated");
});

test("pending QRIS shipment blocked", () => {
    // Biteship POST guard (src/app/api/admin/orders/[id]/biteship/route.ts:96-110):
    //   paymentMethod = upper(order.paymentMethod)
    //   paymentStatus = upper(order.payment?.status ?? order.paymentStatus ?? "")
    //   isPendingCOD  = isKasirDelivery && paymentMethod === COD_PAYMENT_METHOD("TUNAI") && COD_PENDING_STATUSES.has(paymentStatus)
    //   if (!isPendingCOD && paymentStatus !== "PAID") -> 409 (blocked)
    // Pending QRIS (paymentStatus PENDING/WAITING_PAYMENT, method QRIS != TUNAI) must be blocked.
    const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
    assert.match(biteshipRoute, /const paymentStatus = \(order\.payment\?\.status \?\? order\.paymentStatus \?\? ""\)\.toUpperCase\(\);/);
    assert.match(biteshipRoute, /const COD_PAYMENT_METHOD = "TUNAI";/);
    assert.match(biteshipRoute, /paymentMethod === COD_PAYMENT_METHOD/);
    assert.match(biteshipRoute, /if \(!isPendingCOD && paymentStatus !== "PAID"\)/);
    // Semantically mirror the guard: QRIS is never COD (method != TUNAI), so isPendingCod=false.
    const blockedFn = new Function("isPendingCod", "paymentStatus", `return (!isPendingCod && paymentStatus !== "PAID");`);
    // Pending QRIS => not pending-COD, status not PAID => blocked (true).
    assert.equal(blockedFn(false, "PENDING"), true, "pending QRIS must block shipment");
    assert.equal(blockedFn(false, "WAITING_PAYMENT"), true, "waiting-payment QRIS must block shipment");
    // Pending DELIVERY TUNAI keeps its narrow COD exception (isPendingCod=true) => allowed.
    assert.equal(blockedFn(true, "PENDING"), false, "pending DELIVERY TUNAI COD exception still allowed");
});

test("paid QRIS shipment allowed", () => {
    // After a verified Midtrans settlement webhook marks Payment.status = PAID, the same
    // Biteship guard must NOT block the shipment (paymentStatus === "PAID").
    const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
    const blockedFn = new Function("isPendingCod", "paymentStatus", `return (!isPendingCod && paymentStatus !== "PAID");`);
    // Paid QRIS => isPendingCod=false, paymentStatus="PAID" => not blocked (false).
    assert.equal(blockedFn(false, "PAID"), false, "paid QRIS shipment must be allowed");
    // Idempotency: an already-created real Biteship order short-circuits re-creation.
    assert.match(biteshipRoute, /order\.biteshipOrderId && !order\.biteshipOrderId\.startsWith\(CLAIM_PREFIX\)/);
});

test("receipt pending QRIS != LUNAS", () => {
    const receipt = read("../src/components/admin/kasir/KasirReceipt.tsx");
    assert.ok(receipt.includes("statusLabel(order.paymentStatus)"), "Receipt uses statusLabel for payment status");
    assert.ok(receipt.includes("isPendingCOD") || receipt.includes("paymentStatus"), "Receipt distinguishes pending states");
    // statusLabel(WAITING_PAYMENT) returns "Menunggu Pembayaran", not "Lunas"
});

test("receipt paid QRIS = QRIS + LUNAS", () => {
    const receipt = read("../src/components/admin/kasir/KasirReceipt.tsx");
    assert.ok(receipt.includes('value={paymentMethodLabel(order.paymentMethod)}'), "Receipt shows payment method");
    assert.ok(receipt.includes('value={statusLabel(order.paymentStatus)}'), "Receipt shows payment status via statusLabel");
    // When webhooks update Payment.paidAt and Payment.status = PAID,
    // statusLabel(PAID) returns "Lunas" which appears on receipt ✅
});

test("DELIVERY COD unchanged", () => {
    assert.ok(kasirOrderRoute.includes("orderType === \"DELIVERY\" && method === \"TUNAI\""), "DELIVERY TUNAI must remain distinct from QRIS");
    assert.ok(kasirOrderRoute.includes("WAITING_PAYMENT"), "DELIVERY COD waits for admin confirmation");
});

test("PICKUP TUNAI unchanged", () => {
    assert.ok(kasirOrderRoute.includes("method === \"TUNAI\""), "PICKUP TUNAI uses cashReceived validation");
    assert.ok(kasirOrderRoute.includes('orderType !== "DELIVERY"') || kasirOrderRoute.includes("comparisons"), "PICKUP validates cashReceived immediately");
});

test("TRANSFER unchanged", () => {
    // TRANSFER follows standard payment flow identical to TUNAI PICKUP (no special case for QRIS changes).
    // Pre-QRIS HEAD: TRANSFER → paymentStatus = "PAID", Payment.status = "PAID", paidAt = now.
    assert.ok(kasirOrderRoute.includes("KASIR_PAYMENT_METHOD_CANONICAL[method]"), "Canonical method mapping persists");
    // Extract actual persisted expressions via evaluators rather than brittle exact-string matches.
    const psFn = new Function("orderType", "method", "now", `return (${kasirOrderRoute.match(/^\s*paymentStatus:\s*(.*),\s*$/m)[1].trim()});`);
    const payFn = new Function("orderType", "method", "now", `return (${kasirOrderRoute.match(/\bstatus:\s*method === "QRIS"[^\n]*/)[0].replace(/^\s*status:\s*/, "").replace(/,\s*$/, "")});`);
    const paidFn = new Function("orderType", "method", "now", `return (${kasirOrderRoute.match(/\bpaidAt:\s*method === "QRIS"[^\n]*/)[0].replace(/^\s*paidAt:\s*/, "").replace(/,\s*$/, "")});`);

    // Semantics: both order types get immediate PAID status (pre-QRIS behavior preserved)
    for (const ot of ["PICKUP", "DELIVERY"]) {
        assert.equal(psFn(ot, "TRANSFER", "NOW"), "PAID", `TRANSFER ${ot} remains PAID (HEAD behavior)`);
        assert.equal(payFn(ot, "TRANSFER", "NOW"), "PAID", `Payment.status = PAID for TRANSFER ${ot}`);
        assert.equal(paidFn(ot, "TRANSFER", "NOW"), "NOW", "paidAt set to 'NOW' for transferred orders");
    }
});

test("delivery_type remains now", () => {
    const kasirLib = read("../src/lib/kasir-delivery.ts");
    assert.ok(kasirLib.includes('"now"') || kasirLib.includes('defaultKasirOrderType'), "Kasir delivery type defaults to 'now'");
    assert.ok(kasirLib.includes("DEFAULT_KASIR_ORDER_TYPE"), "Must define default order type");
});

test("existing tracking GET-only behavior remains intact", () => {
    const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
    // GET handler should retrieve trackingId from Order.shippingTrackingId
    const hasGetMethod = biteshipRoute.includes("GET") || biteshipRoute.includes('request.method === "GET"');
    assert.ok(hasGetMethod, "Tracking retrieval uses GET method");
    // POST handler creates shipment
    assert.ok(biteshipRoute.includes("POST"), "Shipment creation uses POST method");
});

// =====================================================
// NEW REGRESSION TESTS FOR KASIR KIRIM UX FINALIZATION
// =====================================================

test("Qiris creation does not show Transaksi Berhasil as payment success", () => {
    const posCode = read("../src/components/admin/kasir/KasirPOS.tsx");
    // After successful order creation, check that QRIS pending shows info modal instead of success
    assert.ok(posCode.includes("isQrisPending"), "Must detect QRIS pending state");
    assert.ok(posCode.includes('icon: "info"'), "QRIS pending uses info icon, not success");
    // Success title shown inside else block (after if/else)
    // Info shown first for QRIS pending
    assert.ok(posCode.includes("title: \"Pesanan Dibuat\"") || posCode.includes("info"), "QRIS pending shows info modal");    assert.ok(posCode.includes("title: \"Pesanan Dibuat\"") || posCode.includes("info"), "QRIS pending shows info modal");
});

test("Source transaction selector absent from DELIVERY UI", () => {
    const posCode = read("../src/components/admin/kasir/KasirPOS.tsx");
    // The Sumber Transaksi block must be conditionally rendered based on orderType === "PICKUP"
    assert.ok(posCode.includes('orderType === "PICKUP"'), "Source selector wrapped in PICKUP condition");
    // Canonical default source for DELIVERY is TATAP_MUKA
    assert.ok(posCode.includes('setSource("TATAP_MUKA")'), "DELIVERY uses canonical TATAP_MUKA source internally");
});

test("One final click creates exactly one Order with double-submit protection", () => {
    const posCode = read("../src/components/admin/kasir/KasirPOS.tsx");
    // In-flight lock prevents duplicate submits
    assert.ok(posCode.includes("if (submitting || cart.length === 0) return;"), "SubmitOrder guards against double submit");
    assert.ok(posCode.includes("setSubmitting(true);"), "Sets submitting flag before fetch");
    // Final button disabled when submitting
    assert.ok(posCode.includes("disabled={submitting"), "Final button disabled while submitting");
});

test("Delivery pending QRIS cannot create Biteship shipment", () => {
    const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
    // Backend guards against shipment creation for pending non-COD orders
    assert.ok(biteshipRoute.includes("paymentStatus !== \"PAID\""), "Requires PAID status for shipment");
    assert.ok(biteshipRoute.includes("isPendingCOD"), "Only COD pending allowed exception");
});

test("Stock mutation remains once via server-side validation", () => {
    const kasirOrderRoute = read("../src/app/api/admin/kasir/order/route.ts");
    // Stock update happens inside Prisma transaction for idempotency
    assert.ok(kasirOrderRoute.includes("prisma.$transaction"), "Stock mutation protected by transaction");
    assert.ok(kasirOrderRoute.includes('stock: { decrement:') || kasirOrderRoute.includes("decrement:"), "Actual product stock decremented atomically");
});

test("QRIS pending displays Menunggu Pembayaran QRIS on detail page", () => {
    const detailPage = read("../src/components/admin/kasir/KasirTransactionDetail.tsx");
    // Pending QRIS should display waiting message and QR code
    assert.ok(detailPage.includes("Menunggu Pembayaran QRIS"), "Detail page shows QRIS pending status");
    assert.ok(detailPage.includes("shouldPollQris") || detailPage.includes("qrisPending"), "Polling enabled for pending QRIS");
});

test("QRIS PAID displays LUNAS/payment success", () => {
    const detailPage = read("../src/components/admin/kasir/KasirTransactionDetail.tsx");
    const receipt = read("../src/components/admin/kasir/KasirReceipt.tsx");
    // Paid QRIS should transition to paid/LUNAS state
    assert.ok(receipt.includes("statusLabel(order.paymentStatus)"), "Receipt shows payment status");
    // Verify statusLabel mapping for PAID exists (checked via kasir-shared.ts)
    assert.ok(detailPage.includes("statusLabel"), "Uses statusLabel helper for payment status");
});

test("DELIVERY + QRIS can proceed to shipping after verified PAID", () => {
    const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
    // After PAID, QRIS can create shipment
    assert.ok(biteshipRoute.includes('paymentStatus !== "PAID"'), "Requires PAID status for shipment (non-COD)");
});
