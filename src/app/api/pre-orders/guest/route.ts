import { NextResponse } from "next/server";
import { createPreOrder, getPreOrder, serializePublicPreOrder } from "@/lib/pre-order";
import { preOrderErrorResponse, readJsonBody } from "@/lib/pre-order-route";
import {
    GUEST_PO_MAX_ITEMS,
    GUEST_PO_MAX_QTY_PER_ITEM,
    GUEST_PO_MIN_FILL_MS,
    checkIpRateLimit,
    checkPhoneCaps,
    getClientIp,
    guestReplayKey,
    isValidGuestPickupDate,
    normalizeGuestPhone,
    readReplay,
    writeReplay,
} from "@/lib/pre-order-guest";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// POST /api/pre-orders/guest  (public — no login / registration)
//
// A customer picks catalog products, quantity, pickup date, name and WhatsApp
// number. The PO is created as DRAFT (source WEBSITE) and shows up in the
// admin & kasir PO dashboards for confirmation; payment (DP / pelunasan) is
// taken at the kasir or by admin. Nothing is charged here and the regular
// Order / checkout / WhatsApp purchase flows are untouched.
//
// Protections: IP sliding-window limit, per-phone DB caps, honeypot, minimum
// fill time, strict item validation (catalog products only, prices from DB),
// short replay window returning the same PO for an identical resubmission.
// ---------------------------------------------------------------------------

const noStore = { "Cache-Control": "no-store" };
const reject = (message: string, status = 400, extra: Record<string, string> = {}) =>
    NextResponse.json({ message }, { status, headers: { ...noStore, ...extra } });

type GuestItem = { productId: string; name: string; quantity: number; price: number; notes: string | null };

function parseItems(raw: unknown): { ok: true; items: GuestItem[] } | { ok: false; message: string } {
    if (!Array.isArray(raw) || raw.length === 0) return { ok: false, message: "Pilih minimal satu produk." };
    if (raw.length > GUEST_PO_MAX_ITEMS) return { ok: false, message: `Maksimal ${GUEST_PO_MAX_ITEMS} produk per pre-order.` };
    const seen = new Set<string>();
    const items: GuestItem[] = [];
    for (const entry of raw as unknown[]) {
        const row = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        const productId = typeof row.productId === "string" ? row.productId.trim() : "";
        const quantity = Number(row.quantity);
        if (!/^[a-z0-9_-]{10,64}$/i.test(productId) || seen.has(productId)) return { ok: false, message: "Produk tidak valid." };
        if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > GUEST_PO_MAX_QTY_PER_ITEM) {
            return { ok: false, message: `Jumlah per produk harus 1–${GUEST_PO_MAX_QTY_PER_ITEM}.` };
        }
        seen.add(productId);
        const notes = typeof row.notes === "string" && row.notes.trim() ? row.notes.trim().slice(0, 300) : null;
        // name/price are placeholders — resolveItems() overwrites them from the catalog.
        items.push({ productId, name: "-", quantity, price: 0, notes });
    }
    return { ok: true, items };
}


export async function POST(request: Request) {
    const ip = getClientIp(request);
    if (!checkIpRateLimit(ip)) return reject("Terlalu banyak pengajuan. Coba lagi beberapa menit lagi.", 429, { "Retry-After": "600" });

    const body = await readJsonBody(request);

    // Honeypot: real users never fill this hidden field.
    if (typeof body.website === "string" && body.website.trim() !== "") return reject("Pengajuan tidak dapat diproses.");
    // Minimum fill time: a form submitted in < 3s is almost certainly a bot.
    const startedAt = Number(body.startedAt);
    if (!Number.isFinite(startedAt) || Date.now() - startedAt < GUEST_PO_MIN_FILL_MS) return reject("Mohon lengkapi formulir dengan benar.");

    const customer = typeof body.customer === "string" ? body.customer.trim() : "";
    if (customer.length < 2 || customer.length > 120) return reject("Nama wajib diisi (2–120 karakter).");
    const phone = normalizeGuestPhone(body.phone);
    if (!phone) return reject("Nomor WhatsApp tidak valid.");
    if (!isValidGuestPickupDate(body.pickupDate)) return reject("Tanggal pengambilan harus antara hari ini dan 90 hari ke depan.");
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
    const parsed = parseItems(body.items);
    if (!parsed.ok) return reject(parsed.message);

    try {
        // Replay: identical resubmission (double tap / retry) returns the same PO.
        const replayKey = guestReplayKey(ip, phone, parsed.items);
        const replayedId = readReplay(replayKey);
        if (replayedId) {
            const existing = await getPreOrder(replayedId);
            if (existing?.publicToken) {
                return NextResponse.json({ replayed: true, publicToken: existing.publicToken, preOrder: serializePublicPreOrder(existing) }, { status: 200, headers: noStore });
            }
        }

        const caps = await checkPhoneCaps(phone);
        if (!caps.ok) return reject(caps.message, 429);

        const po = await createPreOrder({
            customer,
            phone,
            note: note || undefined,
            pickupDate: typeof body.pickupDate === "string" && body.pickupDate ? `${body.pickupDate}T00:00:00` : undefined,
            items: parsed.items,
            source: "WEBSITE",
            userId: null,
            initialStatus: "DRAFT",
            withPublicToken: true,
        });
        writeReplay(replayKey, po.id);
        return NextResponse.json({ replayed: false, publicToken: po.publicToken, preOrder: serializePublicPreOrder(po) }, { status: 201, headers: noStore });
    } catch (error) {
        return preOrderErrorResponse(error, "/api/pre-orders/guest#POST", { ip });
    }
}
