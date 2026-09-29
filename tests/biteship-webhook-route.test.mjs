import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const typescript = require("typescript");

const SECRET = "route-test-secret";
const original = {
    subtotal: 120000, shipping: 15000, total: 135000, paymentStatus: "PAID",
    midtransOrderId: "mid-1", stock: 7, customer: "Budi", biteshipOrderId: "bite-test-123",
    biteshipStatus: "created", biteshipTrackingId: "old-track", trackingNumber: "old-resi",
};
let database;
let calls;

function loadRoute() {
    const source = typescript.transpileModule(fs.readFileSync(path.resolve("src/app/api/webhooks/biteship/route.ts"), "utf8"), { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 } }).outputText
        .replace(/exports\.runtime = "nodejs";\s*/, "")
        .replace(/exports\.POST = POST;/, "module.exports = { POST };");
    const sandbox = {
        process, Buffer, Request, Response, URL, console,
        require(name) {
            if (name === "node:crypto") return require("node:crypto");
            if (name === "next/server") return { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } };
            if (name === "@/lib/prisma") return { prisma: database };
            throw new Error(`unexpected import ${name}`);
        }, module: { exports: {} }, exports: {},
    };
    vm.runInNewContext(`(function(require,module,exports){${source}\n})(require,module,exports);`, sandbox, { filename: "webhook-route.ts" });
    return sandbox.module.exports.POST;
}

function reset(order = true) {
    database = {
        order: {
            findUnique: async ({ where }) => { calls.findUnique.push(where); return order && where.biteshipOrderId === original.biteshipOrderId ? { id: "order-1" } : null; },
            updateMany: async ({ where, data }) => { calls.updateMany.push({ where, data }); Object.assign(database.row, data); return { count: 1 }; },
        },
        row: structuredClone(original),
    };
    calls = { findUnique: [], updateMany: [] };
    process.env.BITESHIP_WEBHOOK_SECRET = SECRET;
}
function request(body, secret = SECRET) { return new Request("http://localhost/api/webhooks/biteship", { method: "POST", headers: secret === null ? {} : { "x-afa-biteship-webhook-secret": secret }, body: typeof body === "string" ? body : body === undefined ? undefined : JSON.stringify(body) }); }
async function post(body, secret = SECRET) { return loadRoute()(request(body, secret)); }
async function json(response) { return response.json(); }

beforeEach(() => reset());

test("empty installation probes return exactly ok without authentication or database access", async () => {
    for (const body of [undefined, "   \r\n\t"]) {
        const response = await post(body, null);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "ok");
        assert.equal(calls.findUnique.length, 0);
        assert.equal(calls.updateMany.length, 0);
        assert.match(response.headers.get("content-type"), /text\/plain; charset=utf-8/i);
        assert.equal(response.headers.get("cache-control"), "no-store");
    }
});

test("installation probe stays harmless with a wrong secret and cannot leak internals", async () => {
    const response = await post("", "wrong");
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.equal(text, "ok");
    assert.equal(calls.findUnique.length, 0);
    assert.equal(calls.updateMany.length, 0);
    assert.doesNotMatch(text, /BITESHIP_WEBHOOK_SECRET|BITESHIP_API_KEY|biteshipOrderId|order-1|claim|provider/i);
});

test("only genuinely empty bodies bypass authentication", async () => {
    for (const body of ["{}", "[]", "null", "not-json", JSON.stringify({ event: "order.status", order_id: original.biteshipOrderId, status: "in_transit" }), JSON.stringify({ event: "order.waybill_id", order_id: original.biteshipOrderId }), JSON.stringify({ event: "order.price", order_id: original.biteshipOrderId })]) {
        const response = await post(body, null);
        assert.equal(response.status, 401);
    }
    assert.equal(calls.findUnique.length, 0);
    assert.equal(calls.updateMany.length, 0);
    assert.equal((await post("not-json")).status, 400);
    assert.equal((await post({ event: "order.status", order_id: original.biteshipOrderId, status: "in_transit" }, "wrong")).status, 401);
    assert.equal(calls.findUnique.length, 0);
});

test("missing server secret fails closed for non-empty bodies but permits empty probes", async () => {
    delete process.env.BITESHIP_WEBHOOK_SECRET;
    assert.equal((await post({ event: "order.status", order_id: original.biteshipOrderId, status: "in_transit" }, SECRET)).status, 401);
    const response = await post("", null);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "ok");
    assert.equal(calls.findUnique.length, 0);
    assert.equal(calls.updateMany.length, 0);
});

test("authentication rejects missing, wrong, and different-length secrets without leaking", async () => {
    for (const secret of [null, "wrong", "x".repeat(SECRET.length + 1)]) {
        const response = await post({ event: "unsupported" }, secret);
        assert.equal(response.status, 401); assert.doesNotMatch(await response.text(), /route-test-secret|BITESHIP|api.key/i);
    }
    assert.equal((await post({ event: "unsupported" })).status, 200);
});

test("malformed and invalid payloads return 400", async () => {
    assert.equal((await post("not-json")).status, 400);
    for (const body of [{}, { event: "order.status" }, { event: "order.status", order_id: "bite-test-123" }, { event: "order.status", order_id: "bite-test-123", status: " " }]) assert.equal((await post(body)).status, 400);
});

test("unsupported and unknown orders are safely ignored without mutation", async () => {
    assert.deepEqual(await json(await post({ event: "order.unknown" })), { ignored: true });
    assert.equal(calls.findUnique.length, 0); assert.equal(calls.updateMany.length, 0);
    assert.deepEqual(await json(await post({ event: "order.status", order_id: "missing", status: "in_transit" })), { ignored: true, reason: "not_found" });
    assert.equal(calls.updateMany.length, 0);
});

test("status mapping keeps tracking and waybill identifiers separate", async () => {
    assert.equal((await post({ event: "order.status", order_id: original.biteshipOrderId, status: "in_transit", courier_tracking_id: "track-123", courier_waybill_id: "resi-123" })).status, 200);
    assert.equal(database.row.biteshipStatus, "in_transit"); assert.equal(database.row.biteshipTrackingId, "track-123"); assert.equal(database.row.trackingNumber, "resi-123");
});

test("duplicate status webhook is idempotent and has no business side effects", async () => {
    const body = { event: "order.status", order_id: original.biteshipOrderId, status: "in_transit", courier_tracking_id: "track-123" };
    await post(body); await post(body); assert.equal(calls.findUnique.length, 2);
    assert.equal(database.row.total, original.total); assert.equal(database.row.paymentStatus, original.paymentStatus); assert.equal(database.row.stock, original.stock); assert.equal(database.row.customer, original.customer);
});

test("order.price cannot mutate financial, payment, or stock fields", async () => {
    assert.equal((await post({ event: "order.price", order_id: original.biteshipOrderId, order_price: 1 })).status, 200);
    assert.deepEqual(database.row, original); assert.equal(calls.updateMany.length, 0);
});

test("waybill event maps both provider identifiers and preserves business fields", async () => {
    assert.equal((await post({ event: "order.waybill_id", order_id: original.biteshipOrderId, courier_tracking_id: "track-new", courier_waybill_id: "resi-new" })).status, 200);
    assert.equal(database.row.biteshipTrackingId, "track-new"); assert.equal(database.row.trackingNumber, "resi-new"); assert.equal(database.row.total, original.total); assert.equal(database.row.paymentStatus, original.paymentStatus);
});