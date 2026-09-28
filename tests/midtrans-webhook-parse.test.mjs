/**
 * Regression tests for parseIdr (Midtrans webhook gross_amount parser).
 *
 * Finding #2 fix: Midtrans sends gross_amount as "55000.00" (decimal .00).
 * The previous integer-only regex rejected all decimal strings, causing every
 * settlement webhook to fail with gross_amount_mismatch → HTTP 400.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";

const webhookSrc = fs.readFileSync(
    new URL("../src/app/api/midtrans/webhook/route.ts", import.meta.url),
    "utf8"
);
const midtransSrc = fs.readFileSync(
    new URL("../src/lib/midtrans.ts", import.meta.url),
    "utf8"
);

// Extract parseIdr from source and evaluate in isolated scope
function extractParseIdr(src) {
    const start = src.indexOf("function parseIdr(");
    assert.ok(start !== -1, "parseIdr function must exist in webhook source");
    let depth = 0, i = start;
    while (i < src.length) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
            depth--;
            if (depth === 0) {
                const jsStr = src.slice(start, i + 1).replace(/:\s*unknown/g, "");
                return new Function(`return (${jsStr})`)();
            }
        }
        i++;
    }
    throw new Error("Could not extract parseIdr — unbalanced braces");
}

const parseIdr = extractParseIdr(webhookSrc);

// --- 1. VALID ---
test("parseIdr: '55000' → 55000", () => assert.strictEqual(parseIdr("55000"), 55000));
test("parseIdr: '55000.00' → 55000 (Midtrans decimal format)", () => assert.strictEqual(parseIdr("55000.00"), 55000));
test("parseIdr: '0' → 0", () => assert.strictEqual(parseIdr("0"), 0));
test("parseIdr: '0.00' → 0", () => assert.strictEqual(parseIdr("0.00"), 0));
test("parseIdr: '100000000.00' → 100000000", () => assert.strictEqual(parseIdr("100000000.00"), 100000000));

// --- 2. INVALID ---
test("parseIdr: '55000.50' → null (fractional)", () => assert.strictEqual(parseIdr("55000.50"), null));
test("parseIdr: '55000.01' → null (fractional)", () => assert.strictEqual(parseIdr("55000.01"), null));
test("parseIdr: '55,000' → null (comma)", () => assert.strictEqual(parseIdr("55,000"), null));
test("parseIdr: '55.000' → null (dot-thousands)", () => assert.strictEqual(parseIdr("55.000"), null));
test("parseIdr: '55000abc' → null", () => assert.strictEqual(parseIdr("55000abc"), null));
test("parseIdr: '-55000' → null (negative)", () => assert.strictEqual(parseIdr("-55000"), null));
test("parseIdr: '+55000' → null (signed)", () => assert.strictEqual(parseIdr("+55000"), null));
test("parseIdr: ' 55 000 ' → null (internal spaces)", () => assert.strictEqual(parseIdr(" 55 000 "), null));
test("parseIdr: '1e5' → null (scientific)", () => assert.strictEqual(parseIdr("1e5"), null));
test("parseIdr: 'NaN' → null", () => assert.strictEqual(parseIdr("NaN"), null));
test("parseIdr: 'Infinity' → null", () => assert.strictEqual(parseIdr("Infinity"), null));
test("parseIdr: number 55000 → null (non-string)", () => assert.strictEqual(parseIdr(55000), null));
test("parseIdr: null → null", () => assert.strictEqual(parseIdr(null), null));
test("parseIdr: undefined → null", () => assert.strictEqual(parseIdr(undefined), null));
test("parseIdr: '055000' → null (leading zero)", () => assert.strictEqual(parseIdr("055000"), null));
test("parseIdr: '' → null (empty)", () => assert.strictEqual(parseIdr(""), null));

// --- 3. WEBHOOK FLOW SIMULATION ---
test("webhook flow: '55000.00' passes null-guard and matches DB order.total 55000", () => {
    const result = parseIdr("55000.00");
    assert.strictEqual(result, 55000);
    assert.ok(result !== null, "null guard must not trigger");
    assert.strictEqual(result, 55000, "must equal integer DB order.total");
});

test("webhook flow: '55000.50' is rejected by parser (null → HTTP 400)", () => {
    assert.strictEqual(parseIdr("55000.50"), null);
});

// --- 4. SHA512 SIGNATURE + parseIdr CHAIN ---
test("SHA512: sig computed over raw '55000.00'; parseIdr converts to integer for DB compare", () => {
    const serverKey = "TestServerKey-abc";
    const orderId = "AFA-20260101-000001";
    const statusCode = "200";
    const rawGrossAmount = "55000.00";

    const sigOverDecimal = createHash("sha512")
        .update(`${orderId}${statusCode}${rawGrossAmount}${serverKey}`)
        .digest("hex");
    const sigOverInteger = createHash("sha512")
        .update(`${orderId}${statusCode}55000${serverKey}`)
        .digest("hex");

    // Midtrans computes signature over the raw string (including .00) —
    // so the two signatures are different (this is expected behavior).
    assert.notStrictEqual(sigOverDecimal, sigOverInteger,
        "Signatures over '55000.00' and '55000' must differ");

    // parseIdr converts "55000.00" → 55000 for DB comparison AFTER sig passes
    assert.strictEqual(parseIdr(rawGrossAmount), 55000,
        "parseIdr returns integer 55000 from raw Midtrans decimal string");
});

// --- 5. PRODUCTION FLAG AUDIT (structural) ---
test("MIDTRANS_IS_PRODUCTION=true selects api.midtrans.com (not sandbox)", () => {
    assert.ok(midtransSrc.includes('"https://api.midtrans.com"'), "Production URL must be present");
    assert.ok(midtransSrc.includes('"https://api.sandbox.midtrans.com"'), "Sandbox URL must be present");
    assert.match(midtransSrc, /productionFlag === "true"/, "Must use strict equality for flag");
    assert.match(
        midtransSrc,
        /isProduction\s*\?\s*"https:\/\/api\.midtrans\.com"\s*:\s*"https:\/\/api\.sandbox\.midtrans\.com"/,
        "isProduction ternary must select production URL when true"
    );
});

// --- 6. SECURITY INVARIANTS ---
test("security: signature check is before prisma.$transaction", () => {
    const sigPos = webhookSrc.indexOf("verifyMidtransSignature");
    const dbPos  = webhookSrc.indexOf("prisma.$transaction");
    assert.ok(sigPos !== -1 && dbPos !== -1, "Both must exist");
    assert.ok(sigPos < dbPos, "Signature verification MUST precede DB access");
});

test("security: gross_amount compared against order.total (DB)", () => {
    assert.ok(webhookSrc.includes("grossAmount !== order.total"),
        "Must compare parsed grossAmount against DB order.total");
});

test("security: payment.amount also verified against gross_amount", () => {
    assert.ok(webhookSrc.includes("payment.amount !== grossAmount"),
        "Must also verify payment.amount matches gross_amount");
});

test("security: idempotency optimistic lock filters by PENDING + checks changed.count", () => {
    assert.ok(webhookSrc.includes('status: "PENDING"') && webhookSrc.includes("changed.count"),
        "Must use PENDING lock and check changed.count for idempotency");
});

test("security: webhook never mutates stock or creates order items", () => {
    assert.ok(!webhookSrc.includes("stock") && !webhookSrc.includes("orderItem"),
        "Webhook must not touch stock or create order items");
});

test("security: transaction identity mismatch check present", () => {
    assert.ok(webhookSrc.includes("transaction_identity_mismatch"),
        "Must detect transaction identity conflicts");
});
