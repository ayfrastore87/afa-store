/*
 * Spec for the AFA STORE Kasir (POS) DELIVERY flow.
 *
 * The cashier can now create pickup OR delivery orders, and a delivery order reuses the
 * SAME Google Maps + Biteship architecture as the customer checkout:
 *   - the confirmed map pin stays authoritative (a failed lookup never moves it),
 *   - the free reverse-geocode fallback is awaited BEFORE anything is reported as failed,
 *   - a resolved display address is SEPARATE from the Biteship area match,
 *   - Biteship stays authoritative for destinationAreaId and every shipping price,
 *   - product prices/weights are re-derived server-side (the browser price is ignored),
 *   - cart/destination changes invalidate the selected quote,
 *   - the receipt prints shipping data only for a delivery order and never an internal id,
 *   - shipment creation keeps the existing idempotency and admin authorization.
 *
 * Architecture rules asserted here:
 *   - NO new database column (the existing Order shipping fields are reused),
 *   - NO second shipping engine (every provider call goes through the existing libs),
 *   - no Biteship secret ever reaches the browser,
 *   - the checkout and the old kasir pickup behaviour do not regress.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    BITESHIP_CLAIM_PREFIX,
    DEFAULT_KASIR_ORDER_TYPE,
    KASIR_DELIVERY_MESSAGES,
    KASIR_ORDER_TYPES,
    KASIR_RECEIPT_FORBIDDEN_FIELDS,
    emptyKasirDeliveryDraft,
    hasKasirDeliveryFootprint,
    hasRealShipment,
    isKasirOrderType,
    kasirCartKey,
    kasirDeliveryReadiness,
    kasirDeliveryRequest,
    kasirDeliverySignature,
    kasirOrderTotal,
    kasirOrderTypeLabel,
    kasirReceiptDelivery,
    kasirShipmentAction,
    kasirShippingTotal,
    mustRequoteKasirShipping,
    normalizeKasirDeliveryStatus,
    receiptLeaksInternalField,
    resolveKasirOrderType,
} from "../src/lib/kasir-delivery.ts";
import {
    isValidDeliveryLocation,
    isValidRecipientName,
    isValidRecipientPhone,
} from "../src/lib/checkout-address.ts";
import { groupShippingRatesByCategory } from "../src/lib/shipping-category.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

/** Comment-free view of a source file, so "must NOT contain" rules apply to real code. */
const code = (source) =>
    source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const kasirRoute = read("../src/app/api/admin/kasir/order/route.ts");
const kasirOrdersRoute = read("../src/app/api/admin/kasir/orders/route.ts");
const kasirOrdersDetailRoute = read("../src/app/api/admin/kasir/orders/[id]/route.ts");
const kasirLib = read("../src/lib/kasir.ts");
const biteshipRoute = read("../src/app/api/admin/orders/[id]/biteship/route.ts");
const posPanel = read("../src/components/admin/kasir/KasirPOS.tsx");
const deliveryPanel = read("../src/components/admin/kasir/KasirDeliveryPanel.tsx");
const picker = read("../src/components/admin/kasir/KasirLocationPicker.tsx");
const receipt = read("../src/components/admin/kasir/KasirReceipt.tsx");
const printerPanel = read("../src/components/admin/kasir/KasirPrinterPanel.tsx");
const shipmentActions = read("../src/components/admin/kasir/KasirShipmentActions.tsx");
const history = read("../src/components/admin/kasir/KasirHistory.tsx");
const detail = read("../src/components/admin/kasir/KasirTransactionDetail.tsx");
const escpos = read("../src/lib/thermal-printer/escpos.ts");
const printerTypes = read("../src/lib/thermal-printer/printer-types.ts");
const globals = read("../src/app/globals.css");
const schema = read("../prisma/schema.prisma");
const checkoutPage = read("../src/app/checkout/page.tsx");

const DELIVERY_SHAPE = {
    latitude: -6.0021,
    longitude: 106.012345678,
    address: "Jl. Melati No. 10, Kalitimbang, Cibeber, Kota Cilegon, Banten 42426, Indonesia",
    detail: "Blok C2 No. 14, RT 03/RW 05",
    areaId: "IDJC07",
    areaLabel: "Cibeber, Cilegon",
    province: "Banten",
    city: "Kota Cilegon",
    district: "Cibeber",
    village: "Kalitimbang",
    postalCode: "42426",
    courierCode: "gojek",
    courierName: "Gojek",
    serviceCode: "instant",
    serviceName: "Instant",
    shipping: 25000,
    quoteSignature: "p1:1|",
};

function deliveryDraft(patch = {}) {
    return { ...emptyKasirDeliveryDraft(), ...DELIVERY_SHAPE, ...patch };
}

/** The `areaComponentPatch` helper body: the ONLY place a Biteship area reaches the draft. */
const areaPatchSource = deliveryPanel.slice(
    deliveryPanel.indexOf("function areaComponentPatch"),
    deliveryPanel.indexOf("export default function KasirDeliveryPanel"),
);


// 1. Pickup cashier order does not require shipping.
test("1. pickup is the default and needs no address, area, courier or rates", () => {
    assert.equal(DEFAULT_KASIR_ORDER_TYPE, "PICKUP");
    assert.deepEqual([...KASIR_ORDER_TYPES], ["PICKUP", "DELIVERY"]);
    assert.equal(isKasirOrderType("PICKUP"), true);
    assert.equal(isKasirOrderType("DELIVERY"), true);
    assert.equal(isKasirOrderType("KIRIM"), false);
    assert.equal(kasirOrderTypeLabel("PICKUP"), "Ambil Sendiri");
    assert.equal(kasirOrderTypeLabel("DELIVERY"), "Kirim");
    assert.equal(kasirOrderTypeLabel("nonsense"), "Ambil Sendiri");

    // The historical pickup order shape carries no delivery footprint at all.
    assert.equal(hasKasirDeliveryFootprint({ address: "", shipping: 0 }), false);
    assert.equal(resolveKasirOrderType({ address: "", shipping: 0 }), "PICKUP");
    assert.equal(resolveKasirOrderType(null), "PICKUP");

    // ...and the server only validates/quotes delivery for a DELIVERY request.
    assert.match(kasirRoute, /if \(orderType === "DELIVERY" && deliveryRequest\) \{/);
    assert.match(kasirRoute, /if \(orderType === "DELIVERY"\) \{\s*\n\s*if \(!isValidRecipientName\(customerName\)\)/);
    assert.match(posPanel, /delivery: orderType === "DELIVERY" \? kasirDeliveryRequest\(deliveryDraft\) : undefined/);
    // A pickup order keeps the historical Order shape (empty address / zero shipping).
    assert.match(kasirRoute, /: \{ address: "", shipping: 0 \};/);
});

// 2. Delivery cashier order requires recipient/address.
test("2. a Kirim order requires recipient identity, a confirmed pin and a real area id", () => {
    assert.match(kasirRoute, /Nama penerima wajib diisi untuk pesanan Kirim\./);
    assert.match(kasirRoute, /Nomor WhatsApp penerima wajib diisi untuk pesanan Kirim\./);
    assert.match(kasirRoute, /isValidRecipientName\(customerName\)/);
    assert.match(kasirRoute, /isValidRecipientPhone\(customerWhatsapp\)/);
    assert.match(kasirRoute, /MIN_FORMATTED_ADDRESS_LENGTH/);
    assert.match(kasirRoute, /Tentukan titik lokasi pengiriman di peta sebelum melanjutkan\./);
    assert.match(kasirRoute, /normalizeAreaId\(raw\.destinationAreaId\)/);
    assert.match(kasirRoute, /denyArbitraryAreaId\(destinationAreaId\)/);
    assert.match(kasirRoute, /isValidRateSelection\(\{ courierCode: raw\.courierCode, serviceCode: raw\.serviceCode \}\)/);

    // The UI gate uses the SAME validators as the customer checkout.
    const readiness = kasirDeliveryReadiness({
        recipientValid: isValidRecipientName("Budi") && isValidRecipientPhone("081234567890"),
        locationValid: isValidDeliveryLocation({
            formattedAddress: DELIVERY_SHAPE.address,
            latitude: DELIVERY_SHAPE.latitude,
            longitude: DELIVERY_SHAPE.longitude,
            destinationAreaId: DELIVERY_SHAPE.areaId,
        }),
        quoteSelected: true,
        quoteMatchesDestination: true,
    });
    assert.deepEqual(readiness, { ready: true, reason: null });
    assert.equal(isValidRecipientName(""), false);
    assert.equal(isValidRecipientPhone("abc"), false);

    assert.equal(kasirDeliveryReadiness({ recipientValid: true, locationValid: false, quoteSelected: true, quoteMatchesDestination: true }).reason, KASIR_DELIVERY_MESSAGES.address);
    assert.equal(kasirDeliveryReadiness({ recipientValid: false, locationValid: true, quoteSelected: true, quoteMatchesDestination: true }).reason, KASIR_DELIVERY_MESSAGES.recipient);
    assert.equal(kasirDeliveryReadiness({ recipientValid: true, locationValid: true, quoteSelected: false, quoteMatchesDestination: true }).reason, KASIR_DELIVERY_MESSAGES.courier);
    assert.equal(kasirDeliveryReadiness({ recipientValid: true, locationValid: true, quoteSelected: true, quoteMatchesDestination: false }).reason, KASIR_DELIVERY_MESSAGES.quote);

    // The POS blocks the button with the same reason; the server re-validates anyway.
    assert.match(posPanel, /orderType === "DELIVERY" && !deliveryReadiness\.ready/);
    assert.match(posPanel, /Pengiriman Belum Lengkap/);
});

// 3. Map-confirmed location keeps the confirmed pin coordinates authoritative.
test("3. the confirmed map pin is authoritative and is never replaced by provider data", () => {
    // The cashier picker REUSES the checkout map + search (no second map implementation).
    assert.match(picker, /import \{ CheckoutLocationMap, type CheckoutMapStatus \} from "@\/components\/checkout\/location-map"/);
    assert.match(picker, /import \{ CheckoutLocationSearch \} from "@\/components\/checkout\/location-search"/);
    assert.match(picker, /<CheckoutLocationMap/);
    assert.match(picker, /<CheckoutLocationSearch onSelect=\{handleSearchSelect\}/);
    assert.match(picker, /GUNAKAN LOKASI INI/);
    assert.match(picker, /onInteractionStart=\{handleInteractionStart\}/);
    assert.match(picker, /onInteractionEnd=\{handleInteractionEnd\}/);
    // No reverse geocoding on map movement: the picker never calls a geocoder itself.
    assert.doesNotMatch(code(picker), /reverseGeocodeWithGoogle|requestFallbackReverseAddress/);
    // A suggestion only moves the DRAFT center; confirming is an explicit action.
    assert.match(picker, /A suggestion only navigates the DRAFT center/);

    // Confirmation freezes the pin: ref + draft coordinates come from the confirmed point.
    assert.match(deliveryPanel, /confirmedPinRef\.current = coords;/);
    assert.match(deliveryPanel, /latitude: coords\.latitude,/);
    assert.match(deliveryPanel, /longitude: coords\.longitude,/);
    // The Biteship area patch can NEVER move the pin.
    assert.doesNotMatch(areaPatchSource, /latitude|longitude/);

    // The server re-validates the pin and stores it as delivery metadata.
    assert.match(kasirRoute, /const coordinates = parseDeliveryCoordinates\(raw\.latitude, raw\.longitude\);/);
    assert.match(kasirRoute, /if \(!coordinates\.provided \|\| !coordinates\.valid\)/);
    assert.match(kasirRoute, /destinationLatitude: deliveryRequest\.latitude,/);
    assert.match(kasirRoute, /destinationLongitude: deliveryRequest\.longitude,/);
    assert.match(kasirRoute, /destinationAreaId: deliveryRequest\.destinationAreaId,/);
});

// 4. Google reverse failure can use the existing fallback.
test("4. the existing free fallback is awaited BEFORE anything is reported as failed", () => {
    assert.match(deliveryPanel, /requestFallbackReverseAddress\(pin\.latitude, pin\.longitude, \{ signal: controller\.signal \}\)/);
    assert.match(deliveryPanel, /fallbackAddressToSearchResult\(fallback\.address\)/);
    assert.match(deliveryPanel, /type FallbackSearchResult \} from "@\/lib\/reverse-geocode-fallback"/);
    // No new Nominatim route: the panel reaches the provider through OUR existing route.
    assert.doesNotMatch(code(deliveryPanel), /nominatim|openstreetmap/i);

    const fallbackCalls = [...deliveryPanel.matchAll(/await reverseFallbackAndFill\(requestedPin, requestId\)\) return;/g)].map((match) => match.index);
    const errorWrites = [...deliveryPanel.matchAll(/setReverseState\("error"\)/g)].map((match) => match.index);
    assert.equal(fallbackCalls.length, 2, "both the unrecognized-answer branch and the Google-failure branch await the fallback");
    assert.equal(errorWrites.length, 2);
    assert.ok(fallbackCalls[0] < errorWrites[0]);
    assert.ok(fallbackCalls[1] < errorWrites[1]);

    // Exactly ONE writer of the success state, inside the shared commit path.
    assert.equal((deliveryPanel.match(/setReverseState\("done"\)/g) || []).length, 1);
    assert.ok(deliveryPanel.indexOf('setReverseState("done")') > deliveryPanel.indexOf("const applyResolvedAddress"));

    // Staleness guards survive: a superseded request may never write anything.
    assert.match(deliveryPanel, /isStaleResponse\(reverseRef\.current, requestId\) \|\| isStalePin\(requestedPin, confirmedPinRef\.current\)/);
    assert.match(deliveryPanel, /isStaleResponse\(reverseRef\.current, requestId\) \|\| isStalePin\(pin, confirmedPinRef\.current\)/);

    // When BOTH sources fail, the cashier still gets an explicit escape hatch: a manual
    // street address (plus the manual Biteship area picker) instead of a dead end.
    assert.match(deliveryPanel, /Alamat pengiriman \(isi manual bila peta tidak mengenali lokasi\)/);
    assert.match(kasirRoute, /Alamat pengiriman belum tersedia\. Tentukan lokasi di peta\./);
});

// 5. Display address success is separate from the Biteship area match.
test("5. a resolved display address is never turned into an address failure by the area match", () => {
    const commit = deliveryPanel.slice(deliveryPanel.indexOf("const applyResolvedAddress"), deliveryPanel.indexOf("const reverseFallbackAndFill"));
    assert.ok(commit.indexOf('setReverseState("done")') < commit.indexOf("void matchArea({"), "the address is marked done before the SEPARATE area match starts");
    assert.doesNotMatch(commit, /setAreaState\("not_found"\)/);

    const match = deliveryPanel.slice(deliveryPanel.indexOf("const matchArea = async"), deliveryPanel.indexOf("// Manual Biteship area search"));
    // The area matcher only ever writes AREA state — never the address state.
    assert.doesNotMatch(match, /setReverseState/);
    assert.match(match, /setAreaState\("not_found"\)/);
    assert.match(match, /setAreaState\("matched"\)/);
    // The exact customer-checkout wording is reused for the "address ok, area not matched" case.
    assert.match(deliveryPanel, /Alamat ditemukan\. Pilih kecamatan\/kelurahan pengiriman untuk melanjutkan pengecekan ongkir\./);
    // The cashier's own address detail is never overwritten by map/area metadata.
    assert.doesNotMatch(areaPatchSource, /detail/);
    assert.match(deliveryPanel, /Detail alamat \(nomor rumah \/ blok \/ RT-RW \/ patokan\)/);
});

// 6. Biteship no-match exposes the manual area picker.
test("6. an unmatched area reveals the existing manual Biteship area search", () => {
    assert.match(deliveryPanel, /areaState === "not_found" \?/);
    assert.match(deliveryPanel, /placeholder="Cari kecamatan \/ kelurahan Biteship"/);
    // The manual search reuses the SAME server-proxied Biteship area endpoint.
    assert.match(deliveryPanel, /fetch\(`\/api\/shipping\/areas\?input=\$\{encodeURIComponent\(query\)\}`\)/);
    // The automatic matcher is the shared, bounded, de-duplicated area-match helper.
    assert.match(deliveryPanel, /buildAreaSearchQueries\(address\)/);
    assert.match(deliveryPanel, /pickBestAreaMatch\(candidates, address\)/);
    assert.match(deliveryPanel, /isHighConfidenceAreaMatch\(best, address\)/);
    assert.match(deliveryPanel, /addAreaCandidates\(candidates, seenIds, payload\.areas \|\| \[\]\)/);
    // A successful manual pick only supplies the OFFICIAL area id + components.
    assert.match(deliveryPanel, /const chooseArea = \(area: Area\) => \{/);
    assert.match(areaPatchSource, /areaId: area\.id/);
});

// 7. Rates come only from Biteship / the server.
test("7. shipping prices come only from the server-side Biteship quote", () => {
    assert.match(deliveryPanel, /fetch\("\/api\/shipping\/rates", \{/);
    assert.match(deliveryPanel, /destinationAreaId: draft\.areaId/);
    assert.match(deliveryPanel, /items: items\.map\(\(item\) => \(\{ id: item\.productId, qty: item\.quantity \}\)\)/);
    // The browser sends ONLY ids + quantities: never a price and never a weight.
    const body = deliveryPanel.slice(deliveryPanel.indexOf('fetch("/api/shipping/rates"'), deliveryPanel.indexOf("destinationAreaId: draft.areaId"));
    assert.doesNotMatch(body, /price/);
    assert.doesNotMatch(body, /weight/);
    assert.doesNotMatch(code(deliveryPanel), /shippingCost\s*=|hitungOngkir|calculateShipping/);
    assert.doesNotMatch(code(deliveryPanel), /BITESHIP_API_KEY/);
    // Every displayed price comes from the server response row.
    assert.match(deliveryPanel, /formatRupiah\(rate\.price\)/);
    assert.match(deliveryPanel, /shipping: rate\.price,/);
});

// 8. Instant / Same Day / Regular grouping uses only the returned services.
test("8. grouping mirrors the returned Biteship services and invents nothing", () => {
    const returned = [
        { courierCode: "gojek", courierName: "Gojek", serviceCode: "instant", serviceName: "Instant", description: null, price: 25000, duration: "1 - 3 hours", shipmentCategory: "instant", quoteRef: "gojek|instant" },
        { courierCode: "grab", courierName: "Grab", serviceCode: "sameday", serviceName: "Same Day", description: null, price: 30000, duration: "6-8", shipmentCategory: "same_day", quoteRef: "grab|sameday" },
        { courierCode: "anteraja", courierName: "AnterAja", serviceCode: "reg", serviceName: "Regular", description: null, price: 12000, duration: "1-3", shipmentCategory: "regular", quoteRef: "anteraja|reg" },
    ];
    const groups = groupShippingRatesByCategory(returned);
    assert.deepEqual(groups.map((group) => group.category), ["instant", "same_day", "regular"]);
    assert.deepEqual(groups.map((group) => group.rates.map((rate) => rate.courierCode)), [["gojek"], ["grab"], ["anteraja"]]);
    // Only what the provider returned: a courier absent from the response is absent from the UI.
    assert.equal(groups.flatMap((group) => group.rates).length, returned.length);

    // The cashier panel renders the categories from the SHARED helper + labels.
    assert.match(deliveryPanel, /groupShippingRatesByCategory\(rates\)/);
    assert.match(deliveryPanel, /SHIPPING_CATEGORY_LABELS\[group\.category\]/);
    assert.doesNotMatch(code(deliveryPanel), /"gojek"|"grab"|"lalamove"|"anteraja"/i);
});

// 9. Product/quantity/destination changes invalidate the quote.
test("9. changing products, quantities, destination, pin or area invalidates the selected quote", () => {
    assert.equal(kasirCartKey([{ productId: "a", quantity: 1 }, { productId: "b", quantity: 2 }]), "a:1,b:2");
    assert.equal(kasirCartKey([{ productId: "b", quantity: 2 }, { productId: "a", quantity: 1 }]), "a:1,b:2", "cart identity is order-insensitive");
    assert.notEqual(kasirCartKey([{ productId: "a", quantity: 1 }]), kasirCartKey([{ productId: "a", quantity: 2 }]));
    assert.notEqual(kasirCartKey([{ productId: "a", quantity: 1 }]), kasirCartKey([{ productId: "a", quantity: 1 }, { productId: "b", quantity: 1 }]));

    const signature = kasirDeliverySignature("a:1,b:2", "-6.0|106.0|IDJC07|jalan melati");
    assert.equal(signature, kasirDeliverySignature("a:1,b:2", "-6.0|106.0|IDJC07|jalan melati"));
    assert.notEqual(signature, kasirDeliverySignature("a:2,b:2", "-6.0|106.0|IDJC07|jalan melati"));
    assert.notEqual(signature, kasirDeliverySignature("a:1,b:2", "-6.1|106.0|IDJC07|jalan melati"));
    assert.notEqual(signature, kasirDeliverySignature("a:1,b:2", "-6.0|106.0|IDXX99|jalan melati"));
    assert.equal(mustRequoteKasirShipping(signature, signature), false);
    assert.equal(mustRequoteKasirShipping(signature, "other"), true);

    // The POS keys the *destination* signature on the very same primitives the checkout uses.
    assert.match(posPanel, /const deliverySignature = kasirDeliverySignature\(\s*kasirCartKey\(deliveryItems\),\s*locationSignature\(\{/);
    assert.match(posPanel, /quoteMatchesDestination: !mustInvalidateShipping\(deliveryDraft\.quoteSignature, deliverySignature\)/);
    // A resolved address / matched area drops the previous area identity and its quote.
    assert.match(deliveryPanel, /quoteSignature: "",/);
    // The quote effect re-runs on any destination/cart signature change and clears the courier.
    assert.match(deliveryPanel, /\}, \[draft\.areaId, destinationSignature, rateReload\]\);/);
    assert.match(deliveryPanel, /patchRef\.current\(\{ quoteSignature: destinationSignature, courierCode: "", courierName: "", serviceCode: "", serviceName: "", shipping: 0 \}\)/);
});

// 10. Server does not trust the client shipping price.
test("10. the server re-quotes Biteship and never reads a client price", () => {
    assert.match(kasirRoute, /const quoted = await getBiteshipRates\(\{/);
    assert.match(kasirRoute, /const selected = selectRate\(quoted\.rates, \{\s*courierCode: deliveryRequest\.courierCode,\s*serviceCode: deliveryRequest\.serviceCode,/);
    assert.match(kasirRoute, /if \(!selected\) \{\s*return NextResponse\.json\(\s*\{ message: "Ongkir pilihan sudah berubah\. Silakan pilih kurir kembali\." \},\s*\{ status: 409 \},/);
    assert.match(kasirRoute, /shipping = selected\.price;/);
    // The authoritative weight comes from the database, never from the request body.
    assert.match(kasirRoute, /calculateTotalWeight\(/);
    assert.match(kasirRoute, /authorizeProductItems\(requestItems\)/);
    // No client-supplied price/weight/ongkir is ever read.
    const deliveryBlock = kasirRoute.slice(kasirRoute.indexOf("let deliveryRequest"), kasirRoute.indexOf("// --- server-side shipping re-quote"));
    assert.doesNotMatch(deliveryBlock, /price/);
    assert.doesNotMatch(deliveryBlock, /weight/);
    assert.doesNotMatch(code(kasirRoute), /raw\.shipping|delivery\.shipping|body\.shipping/);
});

// 11. Delivery total = authoritative subtotal + authoritative shipping.
test("11. a delivery total is authoritative subtotal + authoritative ongkir", () => {
    assert.equal(kasirOrderTotal({ subtotal: 100000, orderType: "DELIVERY", shipping: 25000 }), 125000);
    assert.equal(kasirOrderTotal({ subtotal: 100000, orderType: "DELIVERY", shipping: null }), 100000);
    assert.equal(kasirOrderTotal({ subtotal: 100000, orderType: "DELIVERY", shipping: -5 }), 100000);

    // The request payload carries the confirmed destination + selection, but NEVER a price,
    // a weight or an internal Biteship quote reference.
    const request = kasirDeliveryRequest(deliveryDraft());
    assert.equal(request.destinationAreaId, "IDJC07");
    assert.equal(request.courierCode, "gojek");
    assert.equal(request.serviceCode, "instant");
    assert.equal(request.latitude, DELIVERY_SHAPE.latitude);
    assert.equal(request.longitude, DELIVERY_SHAPE.longitude);
    assert.equal(request.addressDetail, DELIVERY_SHAPE.detail);
    assert.deepEqual(Object.keys(request).sort(), [
        "address",
        "addressDetail",
        "city",
        "courierCode",
        "destinationAreaId",
        "district",
        "latitude",
        "longitude",
        "postalCode",
        "province",
        "serviceCode",
        "village",
    ]);
    assert.doesNotMatch(JSON.stringify(request), /price|shipping|quoteRef|weight/);

    assert.match(kasirRoute, /const subtotal = items\.reduce\(\(sum, item\) => sum \+ item\.price \* item\.qty, 0\);/);
    assert.match(kasirRoute, /const total = kasirOrderTotal\(\{ subtotal, orderType, shipping \}\);/);
    // Payment records the total that really includes the ongkir.
    assert.match(kasirRoute, /method: canonicalMethod,\s*amount: total,/);
    // The POS adds ongkir to the displayed total and to the cash check.
    assert.match(posPanel, /const orderTotal = kasirOrderTotal\(\{ subtotal, orderType, shipping: deliveryShipping \}\);/);
    assert.match(posPanel, /\(Number\(cashReceived\) \|\| 0\) < orderTotal/);
});

// 12. Pickup total has no shipping.
test("12. a pickup total never includes shipping", () => {
    assert.equal(kasirShippingTotal("PICKUP", 25000), 0);
    assert.equal(kasirShippingTotal("PICKUP", null), 0);
    assert.equal(kasirOrderTotal({ subtotal: 100000, orderType: "PICKUP", shipping: 25000 }), 100000);
    assert.equal(kasirOrderTotal({ subtotal: 100000, orderType: "PICKUP" }), 100000);

    assert.match(posPanel, /const deliveryShipping = orderType === "DELIVERY" && deliveryReadiness\.ready \? deliveryDraft\.shipping : 0;/);
    assert.match(posPanel, /\{orderType === "DELIVERY" \? \(/);
    assert.match(kasirRoute, /shipping: 0 \};/);
});

// 13. Shipment creation preserves idempotency.
test("13. shipping creation keeps the existing idempotent, admin-only workflow", () => {
    // A delivery order is persisted PAID + PROCESSING so the existing route may ship it.
    assert.match(kasirRoute, /status: orderType === "DELIVERY" \? "PROCESSING" : "COMPLETED",/);
    assert.match(kasirRoute, /completedAt: orderType === "DELIVERY" \? null : now,/);
    assert.match(kasirRoute, /paymentStatus: "PAID",/);
    assert.match(kasirRoute, /processedAt: now,/);

    // The pre-existing claim/compare-and-set is untouched, in both handlers.
    assert.match(biteshipRoute, /const CLAIM_PREFIX = "claim:";/);
    assert.match(biteshipRoute, /biteshipOrderId: null \},\s*data: \{ biteshipOrderId: claim \},/);
    assert.match(biteshipRoute, /if \(order\.biteshipOrderId && !order\.biteshipOrderId\.startsWith\(CLAIM_PREFIX\)\) \{\s*return NextResponse\.json\(\{ order: biteshipOrderView\(order\) \}\);/);
    for (const handler of ["POST", "GET"]) {
        assert.match(biteshipRoute, new RegExp(`export async function ${handler}\\(`));
    }
    // Admin authorization on BOTH handlers; the browser never calls Biteship itself.
    assert.equal((biteshipRoute.match(/getCurrentAdmin\(\)/g) || []).length, 2);
    assert.equal((biteshipRoute.match(/status: 403/g) || []).length, 2);
    assert.match(shipmentActions, /method: kind === "create" \? "POST" : "GET"/);
    assert.doesNotMatch(code(shipmentActions), /BITESHIP_API_KEY|api\.biteship/);
    // The refresh path only reads an EXISTING provider order and never creates one.
    const getHandler = biteshipRoute.slice(biteshipRoute.indexOf("export async function GET("));
    assert.doesNotMatch(getHandler, /createBiteshipOrder/);
    assert.match(getHandler, /retrieveBiteshipOrder\(order\.biteshipOrderId\)/);

    // The UI only offers actions the route would really accept.
    assert.equal(kasirShipmentAction({ biteshipOrderId: null, courierCode: "gojek", serviceCode: "instant", destinationAreaId: "IDJC07", paymentStatus: "PAID", orderStatus: "PROCESSING" }).canCreate, true);
    assert.equal(kasirShipmentAction({ biteshipOrderId: null, courierCode: "gojek", serviceCode: "instant", destinationAreaId: "IDJC07", paymentStatus: "PAID", orderStatus: "COMPLETED" }).canCreate, false);
    assert.equal(kasirShipmentAction({ biteshipOrderId: null, courierCode: "gojek", serviceCode: "instant", destinationAreaId: "IDJC07", paymentStatus: "PENDING", orderStatus: "PROCESSING" }).canCreate, false);
    assert.equal(kasirShipmentAction({ biteshipOrderId: null, courierCode: "", serviceCode: "instant", destinationAreaId: "IDJC07", paymentStatus: "PAID", orderStatus: "PROCESSING" }).canCreate, false);
    assert.equal(kasirShipmentAction({ biteshipOrderId: `${BITESHIP_CLAIM_PREFIX}order1`, courierCode: "gojek", serviceCode: "instant", destinationAreaId: "IDJC07", paymentStatus: "PAID", orderStatus: "PROCESSING" }).canCreate, true, "a stale claim is not a shipment");
    const shipped = kasirShipmentAction({ biteshipOrderId: "bsh_123", paymentStatus: "PAID", orderStatus: "PROCESSING" });
    assert.deepEqual([shipped.canCreate, shipped.canRefresh], [false, true]);
    assert.equal(hasRealShipment("bsh_123"), true);
    assert.equal(hasRealShipment("claim:order1"), false);
    assert.equal(hasRealShipment(null), false);
});

// 14. Receipt includes shipping only for delivery.
test("14. the receipt shows ongkir and the PENGIRIMAN block only for a delivery order", () => {
    assert.equal(kasirReceiptDelivery({ address: "", shipping: 0, customer: "Budi", phone: "0812" }), null, "a pickup order has no delivery block");

    const delivery = kasirReceiptDelivery({
        address: DELIVERY_SHAPE.address,
        shipping: 25000,
        customer: "Budi",
        phone: "081234567890",
        courier: "Gojek",
        service: "Instant",
        biteshipTrackingId: "TRK-1",
    });
    assert.equal(delivery.shippingLabel, "25000");
    assert.equal(delivery.courier, "Gojek");
    assert.equal(delivery.service, "Instant");
    assert.equal(delivery.trackingId, "TRK-1");

    // The 58mm DOM receipt prints Ongkir only under that guard, plus the PENGIRIMAN block.
    assert.match(receipt, /\{delivery && delivery\.shipping > 0 \? \(\s*<Row label="Ongkir"/);
    assert.match(receipt, /PENGIRIMAN/);
    assert.match(receipt, /Alamat Pengiriman/);
    assert.match(printerPanel, /shippingLabel: delivery && delivery\.shipping > 0 \? formatRupiah\(delivery\.shipping\) : null,/);
    // The ESC/POS encoder prints the Ongkir row only when the label exists.
    assert.match(escpos, /if \(data\.shippingLabel != null && data\.shippingLabel !== ""\) \{/);
    assert.match(escpos, /formatColumns\("Ongkir", data\.shippingLabel, width\)/);
    assert.match(escpos, /if \(data\.delivery\) \{/);
    assert.match(escpos, /chunks\.push\(cmdLine\(formatReceiptLine\("PENGIRIMAN", width, "center"\)\)\);/);
    assert.match(printerTypes, /shippingLabel\?: string \| null;/);
    assert.match(printerTypes, /export interface ReceiptDeliveryData \{/);
});

// 15. Receipt excludes internal IDs/secrets.
test("15. a struk never carries an internal identifier, provider id or secret", () => {
    assert.ok(KASIR_RECEIPT_FORBIDDEN_FIELDS.includes("destinationAreaId"));
    assert.ok(KASIR_RECEIPT_FORBIDDEN_FIELDS.includes("originAreaId"));
    assert.ok(KASIR_RECEIPT_FORBIDDEN_FIELDS.includes("shippingQuoteRef"));
    assert.ok(KASIR_RECEIPT_FORBIDDEN_FIELDS.includes("biteshipOrderId"));
    assert.ok(KASIR_RECEIPT_FORBIDDEN_FIELDS.includes("courierCode"));
    assert.ok(KASIR_RECEIPT_FORBIDDEN_FIELDS.includes("serviceCode"));
    assert.equal(receiptLeaksInternalField("Alamat: Jl. Melati, Cibeber"), false);
    assert.equal(receiptLeaksInternalField("destinationAreaId=IDJC07"), true);
    assert.equal(receiptLeaksInternalField("claim:order1"), true);

    // The receipt payload itself is a whitelist: internal fields cannot ride along.
    const printable = kasirReceiptDelivery({
        address: DELIVERY_SHAPE.address,
        shipping: 25000,
        customer: "Budi",
        phone: "081234567890",
        courier: "Gojek",
        service: "Instant",
        destinationAreaId: "IDJC07",
        shippingQuoteRef: "gojek|instant",
        biteshipOrderId: "bsh_123",
        courierCode: "gojek",
        serviceCode: "instant",
        destinationLatitude: -6.0021,
        destinationLongitude: 106.012345678,
        biteshipTrackingId: "TRK-1",
    });
    const serialized = JSON.stringify(printable);
    assert.equal(receiptLeaksInternalField(serialized), false, "no forbidden identifier is part of the printed payload");
    assert.deepEqual(Object.keys(printable).sort(), ["address", "courier", "recipientName", "recipientPhone", "service", "shippingLabel", "trackingId"]);

    // The printed DOM + the API payload feeding it also exclude them.
    assert.doesNotMatch(code(receipt), /destinationAreaId|shippingQuoteRef|biteshipOrderId|courierCode|serviceCode/);
    assert.doesNotMatch(code(printerPanel), /destinationAreaId|shippingQuoteRef|biteshipOrderId/);
    // The API's client payload block exposes no internal identifier at all.
    const clientPayload = kasirLib.slice(kasirLib.indexOf("const delivery ="), kasirLib.indexOf("return {\n        id: order.id"));
    assert.doesNotMatch(clientPayload, /destinationAreaId|originAreaId|shippingQuoteRef|biteshipOrderId|courierCode|serviceCode|Latitude|Longitude/);
    assert.match(clientPayload, /trackingId: order\.biteshipTrackingId \|\| order\.trackingNumber \|\| null,/);
    // ...and a secret is never part of any kasir client file.
    for (const source of [posPanel, deliveryPanel, picker, receipt, printerPanel, shipmentActions, history, detail]) {
        assert.doesNotMatch(code(source), /BITESHIP_API_KEY|MIDTRANS_SERVER_KEY|SUPABASE_SERVICE_ROLE/i);
    }
    assert.match(biteshipRoute, /getBiteshipOriginIdentity\(\)/);
    assert.doesNotMatch(code(kasirRoute), /BITESHIP_API_KEY/);
});

// 16. 58mm receipt CSS exists and long addresses wrap.
test("16. the 58mm print stylesheet is intact and long delivery addresses wrap", () => {
    assert.match(globals, /size: 58mm auto;/);
    assert.match(globals, /#kasir-receipt \{\s*display: none;\s*\}/);
    assert.match(globals, /body > \*:not\(#kasir-receipt\) \{\s*display: none !important;\s*\}/);
    assert.match(globals, /#kasir-receipt \.receipt-sheet \{/);
    assert.match(globals, /width: 58mm/);
    assert.match(globals, /#kasir-receipt \.receipt-section-title \{/);
    assert.match(globals, /#kasir-receipt \.receipt-address-label \{/);
    const addressRule = globals.slice(globals.indexOf("#kasir-receipt .receipt-address {"), globals.indexOf("#kasir-receipt .receipt-address-note {"));
    assert.match(addressRule, /white-space: normal;/);
    assert.match(addressRule, /overflow-wrap: anywhere;/);
    assert.match(addressRule, /word-break: break-word;/);
    // No clipped text: the receipt never scales the sheet, and margins stay at zero.
    assert.doesNotMatch(globals, /#kasir-receipt[^}]*transform: scale/);
    assert.match(globals, /html,\s*body \{\s*margin: 0 !important;/);
    // The 80mm path stays available through the printer profile (paper width is a parameter).
    assert.match(read("../src/lib/thermal-printer/printer-config.ts"), /80/);
});

// 17. Transaction history can reprint the latest persisted receipt.
test("17. a reprint always uses the latest persisted order, not stale client state", () => {
    assert.match(history, /Cetak Ulang Struk/);
    assert.match(history, /href={`\/admin\/kasir\/\$\{order\.id\}`}/);
    // The detail page (which owns the print button) always re-reads the order from the server.
    assert.match(detail, /fetch\(`\/api\/admin\/kasir\/orders\/\$\{id\}`, \{/);
    assert.match(detail, /cache: "no-store",/);
    assert.match(detail, /const loadDetail = useCallback\(async \(\) => \{/);
    // No browser-side order snapshot is stored anywhere for printing.
    for (const source of [receipt, printerPanel, detail, history]) {
        assert.doesNotMatch(code(source), /localStorage|sessionStorage/);
    }
    // The printer reads the freshly loaded order state (which includes the latest shipment).
    assert.match(printerPanel, /useMemo\(\(\) => toReceiptData\(order, cashierName\), \[order, cashierName\]\)/);
    assert.match(receipt, /const delivery = order\.delivery;/);
});

// 18. Delivery status uses the persisted provider status.
test("18. delivery status comes from the persisted provider status and is never invented", () => {
    assert.deepEqual(normalizeKasirDeliveryStatus({ biteshipStatus: null, hasShipment: false }), {
        key: "MENUNGGU_PENGIRIMAN",
        label: "Menunggu Pengiriman",
        raw: "",
        known: true,
    });
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "picking_up", hasShipment: true }).key, "KURIR_MENUJU_PICKUP");
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "picked", hasShipment: true }).key, "PESANAN_DIAMBIL");
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "dropping_off", hasShipment: true }).key, "DALAM_PENGIRIMAN");
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "delivered", hasShipment: true }).key, "TERKIRIM");
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "cancelled", hasShipment: true }).key, "GAGAL");
    assert.equal(normalizeKasirDeliveryStatus({ biteshipStatus: "courier_not_found", hasShipment: true }).key, "GAGAL");

    // The RAW provider status is always preserved next to the normalized label.
    const raw = normalizeKasirDeliveryStatus({ biteshipStatus: "dropping_off", hasShipment: true });
    assert.equal(raw.raw, "dropping_off");
    // An unknown status is shown verbatim instead of being mapped to a made-up transition.
    const unknown = normalizeKasirDeliveryStatus({ biteshipStatus: "some_new_state", hasShipment: true });
    assert.equal(unknown.known, false);
    assert.equal(unknown.label, "some_new_state");

    assert.match(kasirLib, /normalizeKasirDeliveryStatus\(\{ biteshipStatus: order\.biteshipStatus, hasShipment \}\)/);
    assert.match(detail, /delivery\.status\.raw/);
    assert.match(history, /deliveryStatusBadgeClass\(order\.delivery\.status\.key\)/);
});

// 19. Tracking ID is shown only when available.
test("19. a resi / tracking id appears only when the integration really has one", () => {
    const withoutTracking = kasirReceiptDelivery({ address: DELIVERY_SHAPE.address, shipping: 25000, customer: "Budi", phone: "0812" });
    assert.equal(withoutTracking.trackingId, null);
    const withFallbackTracking = kasirReceiptDelivery({ address: DELIVERY_SHAPE.address, shipping: 25000, customer: "Budi", phone: "0812", trackingNumber: "MANUAL-1" });
    assert.equal(withFallbackTracking.trackingId, "MANUAL-1", "the persisted manual resi is used when Biteship has none yet");

    assert.match(escpos, /if \(delivery\.trackingId\) \{/);
    assert.match(escpos, /formatColumns\("No\. Resi", delivery\.trackingId, width\)/);
    assert.match(receipt, /\{delivery\.trackingId \? <Row label="No\. Resi" value=\{delivery\.trackingId\} \/> : null\}/);
    assert.match(detail, /value=\{delivery\.trackingId \|\| "Belum tersedia"\}/);
    assert.match(history, /\{order\.delivery\?\.trackingId \?/);
    // No tracking URL is ever fabricated.
    assert.doesNotMatch(code(detail), /biteship\.com|trackingUrl/);
});

// 20. No Biteship secret reaches the client.
test("20. the provider key never leaves the server", () => {
    assert.match(read("../src/lib/biteship.ts"), /"server-only"|'server-only'/);
    assert.match(read("../src/lib/biteship.ts"), /BITESHIP_API_KEY/);
    assert.doesNotMatch(code(kasirRoute), /NEXT_PUBLIC_/);
    assert.doesNotMatch(code(deliveryPanel), /NEXT_PUBLIC_/);
    // Every kasir/admin route keeps its server-side admin authorization.
    assert.equal((kasirRoute.match(/getCurrentAdmin\(\)/g) || []).length, 1);
    assert.equal((kasirOrdersRoute.match(/getCurrentAdmin\(\)/g) || []).length, 1);
    assert.equal((kasirOrdersDetailRoute.match(/getCurrentAdmin\(\)/g) || []).length, 1);
    // The shared area + rates proxies stay server side (the browser only sends ids).
    assert.match(read("../src/app/api/shipping/areas/route.ts"), /searchBiteshipAreas\(input, type\)/);
    assert.match(read("../src/app/api/shipping/rates/route.ts"), /getBiteshipRates\(\{/);
    assert.doesNotMatch(code(deliveryPanel), /api\.biteship\.com|biteship\.com/);
});

// 21. Existing checkout shipping tests remain green (shared architecture, no fork).
test("21. the customer checkout architecture is untouched and is genuinely reused", () => {
    assert.match(checkoutPage, /<CheckoutLocationMap/);
    assert.match(checkoutPage, /<CheckoutLocationSearch onSelect=\{handleSearchSelect\} \/>/);
    assert.match(checkoutPage, /await reverseFallbackAndFill\(requestedPin, requestId\)\) return;/);
    assert.match(checkoutPage, /groupShippingRatesByCategory\(rates\)/);
    assert.match(checkoutPage, /mustInvalidateShipping\(quoteSignature, destinationSignature\)/);
    assert.match(checkoutPage, /fetch\("\/api\/shipping\/rates", \{/);
    // The cashier reuses the same modules instead of forking them.
    assert.match(picker, /from "@\/components\/checkout\/location-map"/);
    assert.match(picker, /from "@\/components\/checkout\/location-search"/);
    assert.match(deliveryPanel, /from "@\/lib\/google-geocoding"/);
    assert.match(deliveryPanel, /from "@\/lib\/reverse-geocode-fallback"/);
    assert.match(deliveryPanel, /from "@\/lib\/area-match"/);
    assert.match(deliveryPanel, /from "@\/lib\/checkout-address"/);
    assert.match(deliveryPanel, /from "@\/lib\/shipping-category"/);
});

// 22. Existing cashier tests remain green (pickup behaviour + payment/source rules).
test("22. the existing pickup cashier flow is preserved", () => {
    // Payment methods, sources and their canonical mapping are unchanged.
    assert.match(kasirLib, /export const KASIR_PAYMENT_METHODS = \["TUNAI", "TRANSFER", "QRIS"\] as const;/);
    assert.match(kasirLib, /export const KASIR_SOURCES = \["TATAP_MUKA", "WHATSAPP"\] as const;/);
    assert.match(kasirLib, /TRANSFER: "TRANSFER_BANK",/);
    assert.match(kasirRoute, /MAX_KASIR_QUANTITY/);
    assert.match(kasirRoute, /Uang yang diterima kurang dari total belanja\./);
    assert.match(kasirRoute, /cashReceived hanya boleh diisi untuk pembayaran Tunai\./);
    // The transaction is still atomic (advisory lock + stock decrement + invoice).
    assert.match(kasirRoute, /pg_advisory_xact_lock\(hashtext\(\$\{todayPrefix\}\)\)/);
    assert.match(kasirRoute, /stock: \{ decrement: item\.qty \}/);
    assert.match(kasirRoute, /formatOrderInvoice\(now, todayCount \+ 1\)/);
    // A pickup order is still recorded as PAID with no shipping at all.
    assert.match(kasirRoute, /paymentStatus: "PAID",/);
    assert.match(kasirRoute, /method: canonicalMethod,\s*amount: total,\s*status: "PAID",/);
    // The POS keeps its existing pickup UI, payment and source selectors.
    assert.match(posPanel, /PAYMENT_METHODS\.map\(\(method\) => \{/);
    assert.match(posPanel, /\[\"TATAP_MUKA", "WHATSAPP"\] as const/);
    assert.match(posPanel, /Sumber Transaksi/);
    assert.match(posPanel, /Metode Pembayaran/);
});

// The existing Order shipping columns already represent everything the cashier delivery
// flow needs, so the feature ships WITHOUT a new migration.
test("no new database column is required for kasir delivery", () => {
    for (const field of [
        "courier",
        "courierCode",
        "service",
        "serviceCode",
        "shippingQuoteRef",
        "destinationAreaId",
        "originAreaId",
        "destinationLatitude",
        "destinationLongitude",
        "destinationProvince",
        "destinationCity",
        "destinationDistrict",
        "destinationVillage",
        "destinationPostalCode",
        "biteshipOrderId",
        "biteshipStatus",
        "biteshipTrackingId",
        "biteshipLabelUrl",
        "biteshipCreatedAt",
        "source",
        "cashReceived",
        "change",
        "shipping",
    ]) {
        assert.match(schema, new RegExp(`^\\s+${field}\\s`, "m"), `Order.${field} must already exist`);
    }
    assert.match(schema, /^\s+weight\s+Int\s+@default\(0\)$/m, "OrderItem.weight already exists");
});








