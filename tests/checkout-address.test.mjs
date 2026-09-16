import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
    ADDRESS_MODES,
    ADDRESS_MODE_HINTS,
    ADDRESS_MODE_LABELS,
    ADDRESS_DETAIL_PLACEHOLDER,
    ADDRESS_NOTE_PLACEHOLDER,
    CHECKOUT_PLACEHOLDERS,
    DEFAULT_ADDRESS_MODE,
    EMPTY_ADDRESS_FIELDS,
    MIN_FORMATTED_ADDRESS_LENGTH,
    RECIPIENT_NAME_PLACEHOLDER,
    RECIPIENT_PHONE_PLACEHOLDER,
    SENDER_NAME_PLACEHOLDER,
    SENDER_PHONE_PLACEHOLDER,
    addressFieldsForMode,
    cleanFieldValue,
    formatDeliveryAddress,
    isDistinctDropshipSender,
    isPlaceholderText,
    isStalePin,
    isStaleResponse,
    isValidDeliveryLocation,
    isValidRecipientName,
    isValidRecipientPhone,
    joinAddressParts,
    locationSignature,
    mustInvalidateShipping,
    normalizeComparableName,
    normalizeRecipientPhone,
    normalizedPin,
    pinSignature,
    resolvePickerCenter,
    savedAddressPin,
    streetLevelAddress,
} from "../src/lib/checkout-address.ts";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

const checkoutPage = read("../src/app/checkout/page.tsx");

/* ==========================================================================
 * 1. Exactly three address modes, all copy centralised in the shared module
 * ========================================================================== */

test("checkout exposes exactly three address modes with real labels + hints", () => {
    assert.deepEqual([...ADDRESS_MODES], ["saved", "dropship", "other"]);
    assert.equal(ADDRESS_MODE_LABELS.saved, "Alamat Saya");
    assert.equal(ADDRESS_MODE_LABELS.dropship, "Dropshipper");
    assert.equal(ADDRESS_MODE_LABELS.other, "Alamat Lain");
    for (const mode of ADDRESS_MODES) {
        assert.ok(ADDRESS_MODE_HINTS[mode].trim().length > 10, `hint missing for ${mode}`);
    }
    assert.ok(ADDRESS_MODES.includes(DEFAULT_ADDRESS_MODE));
});

test("placeholder-only hints exist for every checkout field", () => {
    assert.equal(CHECKOUT_PLACEHOLDERS.recipientName, RECIPIENT_NAME_PLACEHOLDER);
    assert.equal(CHECKOUT_PLACEHOLDERS.phone, RECIPIENT_PHONE_PLACEHOLDER);
    assert.equal(CHECKOUT_PLACEHOLDERS.addressDetail, ADDRESS_DETAIL_PLACEHOLDER);
    assert.equal(CHECKOUT_PLACEHOLDERS.senderName, SENDER_NAME_PLACEHOLDER);
    assert.equal(CHECKOUT_PLACEHOLDERS.senderPhone, SENDER_PHONE_PLACEHOLDER);
    // The note hint is guarded too, so "Catatan pengiriman" can never be submitted as a note.
    assert.equal(CHECKOUT_PLACEHOLDERS.note, ADDRESS_NOTE_PLACEHOLDER);
});

/* ==========================================================================
 * 2. Hints are hints: a placeholder can never become a submitted value
 * ========================================================================== */

test("example/hint text is detected and cleaned away", () => {
    for (const hint of Object.values(CHECKOUT_PLACEHOLDERS)) {
        assert.equal(isPlaceholderText(hint), true, `not detected as hint: ${hint}`);
        assert.equal(isPlaceholderText(`  ${hint}  `), true);
        assert.equal(cleanFieldValue(hint), "");
        assert.equal(cleanFieldValue(`  ${hint}  `), "");
    }
    assert.equal(isPlaceholderText("cth: Budi"), true);
    assert.equal(isPlaceholderText("Contoh: Siti Nurhaliza"), true);
    assert.equal(isPlaceholderText("Budi Santoso"), false);
    assert.equal(isPlaceholderText(""), false);
    assert.equal(isPlaceholderText(123), false);
    assert.equal(cleanFieldValue("  Budi  "), "Budi");
    assert.equal(cleanFieldValue(null), "");
});

/* ==========================================================================
 * 3. Deterministic recipient block per mode (no leakage between modes)
 * ========================================================================== */

test("mode selection fills the recipient block deterministically", () => {
    const saved = { recipientName: "Siti", phone: "081234567890", detail: "Blok C2 No. 12", note: "Pagar hijau" };
    assert.deepEqual(addressFieldsForMode("saved", saved), {
        recipientName: "Siti",
        phone: "081234567890",
        addressDetail: "Blok C2 No. 12",
        note: "Pagar hijau",
    });
    // No saved record -> nothing invented.
    assert.deepEqual(addressFieldsForMode("saved", null), EMPTY_ADDRESS_FIELDS);
    // Dropship + other always start empty: the saved recipient never leaks in.
    assert.deepEqual(addressFieldsForMode("dropship", saved), EMPTY_ADDRESS_FIELDS);
    assert.deepEqual(addressFieldsForMode("other", saved), EMPTY_ADDRESS_FIELDS);
    // A hint stored in a saved record is never treated as real data.
    assert.deepEqual(
        addressFieldsForMode("saved", { recipientName: RECIPIENT_NAME_PLACEHOLDER, note: ADDRESS_NOTE_PLACEHOLDER }),
        EMPTY_ADDRESS_FIELDS,
    );
});

test("mode fields are fresh copies (no shared mutable state)", () => {
    const fields = addressFieldsForMode("dropship", null);
    fields.recipientName = "mutated";
    assert.equal(EMPTY_ADDRESS_FIELDS.recipientName, "");
    assert.equal(addressFieldsForMode("other", null).recipientName, "");
});

/* ==========================================================================
 * 4. Recipient validation (identity is never guessed)
 * ========================================================================== */

test("recipient name must be real text", () => {
    assert.equal(isValidRecipientName("Siti"), true);
    assert.equal(isValidRecipientName("Siti Nurhaliza"), true);
    assert.equal(isValidRecipientName("A"), false);
    assert.equal(isValidRecipientName(""), false);
    assert.equal(isValidRecipientName("   "), false);
    assert.equal(isValidRecipientName("1234"), false);
    assert.equal(isValidRecipientName("-- --"), false);
    assert.equal(isValidRecipientName(RECIPIENT_NAME_PLACEHOLDER), false);
});

test("recipient phone must be an Indonesian number", () => {
    assert.equal(isValidRecipientPhone("081234567890"), true);
    assert.equal(isValidRecipientPhone("0812 3456 7890"), true);
    assert.equal(isValidRecipientPhone("+62 812-3456-7890"), true);
    assert.equal(isValidRecipientPhone("6281234567890"), true);
    assert.equal(isValidRecipientPhone(""), false);
    assert.equal(isValidRecipientPhone("12345"), false);
    assert.equal(isValidRecipientPhone("0812"), false);
    assert.equal(isValidRecipientPhone("abc0812345678"), false);
    assert.equal(isValidRecipientPhone(RECIPIENT_PHONE_PLACEHOLDER), false);
    assert.equal(isValidRecipientPhone("0000000000000000000"), false);
});

test("phone is canonicalised to 62-prefixed digits", () => {
    assert.equal(normalizeRecipientPhone("0812 3456 7890"), "6281234567890");
    assert.equal(normalizeRecipientPhone("6281234567890"), "6281234567890");
    assert.equal(normalizeRecipientPhone("+62 812-3456-7890"), "6281234567890");
    assert.equal(normalizeRecipientPhone(""), "");
});

/* ==========================================================================
 * 5. Dropship sender is a different party from the recipient
 * ========================================================================== */

test("dropship sender must exist and must never be the recipient", () => {
    assert.equal(isDistinctDropshipSender("AFA Gift", "Siti"), true);
    assert.equal(isDistinctDropshipSender("AFA Gift", ""), true);
    assert.equal(isDistinctDropshipSender("", "Siti"), false);
    assert.equal(isDistinctDropshipSender("   ", "Siti"), false);
    assert.equal(isDistinctDropshipSender("siti", "SITI"), false);
    assert.equal(isDistinctDropshipSender("  siti   nur ", "Siti Nur"), false);
    assert.equal(isDistinctDropshipSender(SENDER_NAME_PLACEHOLDER, "Siti"), false);
    assert.equal(normalizeComparableName("  Siti   Nur "), "siti nur");
});

/* ==========================================================================
 * 6. Coordinates: full precision, no fabrication, stale responses detectable
 * ========================================================================== */

test("pins keep full precision and reject junk", () => {
    const precise = { latitude: -6.175392418416817, longitude: 106.8271529016937 };
    assert.deepEqual(normalizedPin(precise), precise);
    assert.equal(pinSignature(precise), "-6.175392418416817|106.8271529016937");
    assert.deepEqual(normalizedPin({ latitude: " -6.2 ", longitude: "106.8" }), { latitude: -6.2, longitude: 106.8 });
    assert.deepEqual(normalizedPin({ latitude: 90, longitude: -180 }), { latitude: 90, longitude: -180 });
    assert.equal(normalizedPin({ latitude: 91, longitude: 0 }), null);
    assert.equal(normalizedPin({ latitude: 0, longitude: 181 }), null);
    assert.equal(normalizedPin({ latitude: Number.NaN, longitude: 0 }), null);
    assert.equal(normalizedPin({ latitude: Infinity, longitude: 0 }), null);
    assert.equal(normalizedPin({ latitude: "abc", longitude: 106.8 }), null);
    assert.equal(normalizedPin(null), null);
    assert.equal(pinSignature(null), "");
});

test("a response for another pin (or a superseded request) is stale", () => {
    const pin = { latitude: -6.2, longitude: 106.8 };
    assert.equal(isStalePin(pin, { ...pin }), false);
    assert.equal(isStalePin({ latitude: -6.3, longitude: 106.8 }, pin), true);
    assert.equal(isStalePin(null, pin), true);
    assert.equal(isStalePin({ latitude: 999, longitude: 106.8 }, pin), true);
    assert.equal(isStalePin(pin, null), true);
    assert.equal(isStaleResponse(1, 1), false);
    assert.equal(isStaleResponse(2, 1), true);
});

test("saved addresses never have coordinates fabricated", () => {
    assert.equal(savedAddressPin(null), null);
    assert.equal(savedAddressPin({ recipientName: "Siti", detail: "Blok C2" }), null);
    assert.equal(savedAddressPin({ latitude: null, longitude: null }), null);
    assert.equal(savedAddressPin({ latitude: "", longitude: "" }), null);
    // Half a pin is not a pin: it must not be completed with 0.
    assert.equal(savedAddressPin({ latitude: null, longitude: 106.8 }), null);
    assert.equal(savedAddressPin({ latitude: -6.2, longitude: null }), null);
    assert.deepEqual(savedAddressPin({ latitude: -6.2, longitude: 106.8 }), { latitude: -6.2, longitude: 106.8 });
});

test("picker center falls back without inventing a location", () => {
    const fallback = { latitude: -6.2, longitude: 106.816666 };
    assert.deepEqual(
        resolvePickerCenter({ latitude: -6.1, longitude: 106.9 }, { latitude: -6.2, longitude: 106.8 }, fallback),
        { latitude: -6.1, longitude: 106.9 },
    );
    assert.deepEqual(
        resolvePickerCenter(null, { latitude: -6.25, longitude: 106.85 }, fallback),
        { latitude: -6.25, longitude: 106.85 },
    );
    assert.deepEqual(resolvePickerCenter(null, { recipientName: "Siti", detail: "Blok C2" }, fallback), fallback);
    assert.deepEqual(resolvePickerCenter({ latitude: 999, longitude: 0 }, null, fallback), fallback);
});

/* ==========================================================================
 * 7. Destination validity + quote invalidation
 * ========================================================================== */

test("a destination needs a real address, an area id and a valid pin", () => {
    const valid = { formattedAddress: "Jl. Melati 12, Cibeber, Cilegon", latitude: -6.2, longitude: 106.8, destinationAreaId: "IDNP1" };
    assert.equal(isValidDeliveryLocation(valid), true);
    assert.equal(isValidDeliveryLocation(null), false);
    assert.equal(isValidDeliveryLocation({ ...valid, destinationAreaId: "" }), false);
    assert.equal(isValidDeliveryLocation({ ...valid, destinationAreaId: "  " }), false);
    assert.equal(isValidDeliveryLocation({ ...valid, latitude: undefined }), false);
    assert.equal(isValidDeliveryLocation({ ...valid, longitude: undefined }), false);
    assert.equal(isValidDeliveryLocation({ ...valid, formattedAddress: "abcd" }), false);
    assert.equal(MIN_FORMATTED_ADDRESS_LENGTH, 5);
});

test("any destination change invalidates the previous quote", () => {
    const base = { latitude: -6.2, longitude: 106.8, destinationAreaId: "IDNP1", formattedAddress: "Jl. Melati 12, Cibeber" };
    const signature = locationSignature(base);
    assert.ok(signature.length > 0);
    assert.equal(mustInvalidateShipping(signature, locationSignature({ ...base })), false);
    assert.equal(mustInvalidateShipping(signature, locationSignature({ ...base, destinationAreaId: "IDNP2" })), true);
    assert.equal(mustInvalidateShipping(signature, locationSignature({ ...base, latitude: -6.2000001 })), true);
    assert.equal(mustInvalidateShipping(signature, locationSignature({ ...base, formattedAddress: "Jl. Melati 13, Cibeber" })), true);
    // Case + surrounding whitespace are not a location change.
    assert.equal(
        mustInvalidateShipping(signature, locationSignature({ ...base, formattedAddress: `  ${base.formattedAddress.toUpperCase()}  ` })),
        false,
    );
    // A destination that is not usable yet never matches a real quote.
    assert.equal(mustInvalidateShipping(signature, ""), true);
    assert.equal(mustInvalidateShipping("", ""), false);
    assert.equal(locationSignature(null), "");
    assert.equal(locationSignature({}), "");
});

/* ==========================================================================
 * 8. Address composition (street line + user detail + admin components)
 * ========================================================================== */

test("street address stays street-level, full address adds the admin parts", () => {
    const parts = {
        streetLine: "Jl. Melati No. 12",
        detail: "Blok C2 No. 12 RT 03/RW 05",
        village: "Kalitimbang",
        district: "Cibeber",
        city: "Kota Cilegon",
        province: "Banten",
        postalCode: "42426",
    };
    assert.equal(streetLevelAddress(parts), "Jl. Melati No. 12, Blok C2 No. 12 RT 03/RW 05");
    assert.equal(
        formatDeliveryAddress(parts),
        "Jl. Melati No. 12, Blok C2 No. 12 RT 03/RW 05, Kalitimbang, Cibeber, Kota Cilegon, Banten, 42426",
    );
    // The customer's own detail alone is still a usable street address (no map street line).
    assert.equal(streetLevelAddress({ detail: "Blok C2 No. 12" }), "Blok C2 No. 12");
    assert.equal(streetLevelAddress({}), "");
});

test("joinAddressParts de-duplicates case-insensitively and caps the length", () => {
    assert.equal(joinAddressParts(["Cibeber", "cibeber", " Banten "]), "Cibeber, Banten");
    assert.equal(joinAddressParts(["", null, undefined, "Banten"]), "Banten");
    assert.equal(joinAddressParts(["x".repeat(50)], 10), "xxxxxxxxxx");
    assert.equal(joinAddressParts(["Jl. Melati", ADDRESS_DETAIL_PLACEHOLDER]), "Jl. Melati");
});

/* ==========================================================================
 * 9. The page consumes the shared helpers instead of re-implementing rules
 * ========================================================================== */

test("checkout renders the three modes from the shared labels/hints", () => {
    assert.match(checkoutPage, /ADDRESS_MODE_LABELS\.saved/);
    assert.match(checkoutPage, /ADDRESS_MODE_LABELS\.dropship/);
    assert.match(checkoutPage, /ADDRESS_MODE_LABELS\.other/);
    assert.match(checkoutPage, /ADDRESS_MODE_HINTS\[mode\]/);
    // The legacy fourth mode is gone.
    assert.doesNotMatch(checkoutPage, /mode === "profile"/);
    assert.doesNotMatch(checkoutPage, /setMode\("profile"\)/);
});

test("every placeholder is only rendered as a placeholder attribute", () => {
    assert.match(checkoutPage, /placeholder={RECIPIENT_NAME_PLACEHOLDER}/);
    assert.match(checkoutPage, /placeholder={RECIPIENT_PHONE_PLACEHOLDER}/);
    assert.match(checkoutPage, /placeholder={ADDRESS_DETAIL_PLACEHOLDER}/);
    assert.match(checkoutPage, /placeholder={SENDER_NAME_PLACEHOLDER}/);
    assert.match(checkoutPage, /placeholder={SENDER_PHONE_PLACEHOLDER}/);
    assert.match(checkoutPage, /placeholder={ADDRESS_NOTE_PLACEHOLDER}/);
});

test("switching mode resets the recipient block (dropship/other start empty)", () => {
    assert.match(checkoutPage, /applyAddressFields\(addressFieldsForMode\(next, null\)\)/);
    assert.match(checkoutPage, /applyAddressFields\(addressFieldsForMode\("saved", saved\)\)/);
    assert.match(checkoutPage, /setSelectedProfileId\(null\)/);
});

test("map/area components are the only address source (no free-text admin fields)", () => {
    // The destination payload never reads the removed free-text form fields.
    assert.doesNotMatch(checkoutPage, /form\.(address|province|city|district|postalCode|village)\b/);
    assert.match(checkoutPage, /address: destinationStreet/);
    assert.match(checkoutPage, /province: destinationFieldValues\.province/);
    assert.match(checkoutPage, /city: destinationFieldValues\.city/);
    assert.match(checkoutPage, /district: destinationFieldValues\.district/);
    assert.match(checkoutPage, /postalCode: destinationFieldValues\.postalCode/);
    assert.match(checkoutPage, /destinationVillage: destinationFieldValues\.village/);
    assert.match(checkoutPage, /const destinationStreet = streetLevelAddress\(destinationParts\)/);
    assert.match(checkoutPage, /const destinationValid = isValidDeliveryLocation\(/);
});

test("area patches only ever touch admin components, never the street line", () => {
    const start = checkoutPage.indexOf("function areaAddressPatch(");
    assert.ok(start > 0, "areaAddressPatch helper missing");
    const helper = checkoutPage.slice(start, start + 400);
    assert.doesNotMatch(helper, /streetLine/);
    assert.doesNotMatch(helper, /displayName/);
    assert.match(
        checkoutPage,
        /setDestinationAddress\(\(current\) => \(\{ \.\.\.EMPTY_DESTINATION_ADDRESS, \.\.\.\(current \?\? \{\}\), \.\.\.patch \}\)\)/,
    );
    assert.match(checkoutPage, /patchDestinationAddress\(areaAddressPatch\(a\)\)/);
    assert.match(checkoutPage, /patchDestinationAddress\(areaAddressPatch\(best\)\)/);
});

test("quote validity is render-visible state, cleared before a new destination quote", () => {
    assert.match(checkoutPage, /const \[quoteSignature, setQuoteSignature\] = useState\(""\)/);
    assert.doesNotMatch(checkoutPage, /quoteSignatureRef/);
    assert.match(checkoutPage, /const shippingReady = Boolean\(selectedRate\) && !mustInvalidateShipping\(quoteSignature, destinationSignature\)/);
    assert.match(checkoutPage, /setQuoteSignature\(""\);[\s\S]{0,300}if \(!session\?\.items\?\.length \|\| !destinationArea\)/);
    assert.match(checkoutPage, /setQuoteSignature\(destinationSignature\)/);
    // The summary only counts a quote that still belongs to the current destination.
    assert.match(checkoutPage, /const total = \(session\?\.subtotal \?\? 0\) \+ \(shippingReady \? shipping : 0\)/);
});

test("submit guards block empty recipient, stale ongkir and missing area", () => {
    assert.match(checkoutPage, /if \(!isValidRecipientName\(form\.recipientName\)\) \{ setError\("Nama penerima wajib diisi\."\); return; \}/);
    assert.match(checkoutPage, /if \(!isValidRecipientPhone\(form\.phone\)\) \{ setError\("Nomor HP penerima wajib diisi\."\); return; \}/);
    assert.match(checkoutPage, /if \(mode === "dropship" && !isDistinctDropshipSender\(senderName, form\.recipientName\)\)/);
    assert.match(checkoutPage, /if \(!destinationValid\) \{ setError\("Tentukan titik lokasi pengiriman di peta sebelum melanjutkan\."\); return; \}/);
    assert.match(checkoutPage, /if \(!destinationArea\) \{ setError\("Pilih kecamatan \/ kelurahan tujuan pengiriman\."\); return; \}/);
    assert.match(checkoutPage, /if \(!shippingReady\) \{ setError\("Ongkir sudah tidak berlaku untuk lokasi ini\. Pilih ulang jasa kurir\."\); return; \}/);
    assert.match(checkoutPage, /if \(!selectedRate\) \{ setError\("Pilih jasa kurir sebelum melanjutkan\."\); return; \}/);
    assert.match(
        checkoutPage,
        /const canSubmit = destinationValid && shippingReady && recipientValid && dropshipValid && !paying && !processing;/,
    );
    // The payload is cleaned, so a hint can never be submitted.
    assert.match(checkoutPage, /recipientName: cleanFieldValue\(form\.recipientName\)/);
});

test("reverse geocode and area match are race protected and pin-bound", () => {
    assert.match(checkoutPage, /const requestId = \+\+reverseRef\.current;/);
    assert.match(checkoutPage, /isStalePin\(requestedPin, confirmedPinRef\.current\)/);
    assert.match(checkoutPage, /const requestId = \+\+areaMatchRef\.current;/);
    assert.match(checkoutPage, /isStaleResponse\(areaMatchRef\.current, requestId\)/);
    assert.match(checkoutPage, /requestId !== rateRequestRef\.current/);
    // Panning only moves the draft: reverse geocoding happens on explicit confirmation.
    assert.match(checkoutPage, /const handleCenterChange = \(coords: DeliveryCoordinates\) => \{\s*setDraftLocation\(coords\);\s*\};/);
    // Confirm is the only place that reverse-geocodes a location.
    assert.equal((checkoutPage.match(/reverseGeocodeAndFill\(/g) || []).length, 1);
});

test("saved addresses contribute a pin only when they really have coordinates", () => {
    assert.match(checkoutPage, /const storedPin = savedAddressPin\(/);
    assert.match(checkoutPage, /if \(storedPin\) \{ setDraftLocation\(storedPin\); setMapZoom\(17\); \}/);
    assert.match(checkoutPage, /resolvePickerCenter\(confirmedLocation, mode === "saved" \? selectedProfile : null, DEFAULT_MAP_CENTER\)/);
});
