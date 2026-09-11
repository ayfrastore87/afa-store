import { NextResponse } from "next/server";
import { z } from "zod";

import { getPartnerPriceStatus, MAX_PARTNER_COST_PRICE } from "@/lib/partner-dashboard";
import { prisma } from "@/lib/prisma";
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

// Asia/Jakarta is UTC+7 year-round (no DST), so WIB midnight on a calendar day
// is a fixed instant. Interpreting a date-only input this way prevents the
// classic "date shifts a day because of UTC" bug (spec Tahap VI §11, §42).
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

function parseEffectiveFrom(input: string): Date | null {
    const value = input.trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
        const year = Number(dateOnly[1]);
        const month = Number(dateOnly[2]);
        const day = Number(dateOnly[3]);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        const asUtc = new Date(Date.UTC(year, month - 1, day));
        // Reject impossible calendar dates such as 2026-02-31 (Date.UTC rolls over).
        if (asUtc.getUTCFullYear() !== year || asUtc.getUTCMonth() !== month - 1 || asUtc.getUTCDate() !== day) return null;
        return new Date(asUtc.getTime() - WIB_OFFSET_MS);
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const priceSchema = z.object({
    productId: z.string().trim().min(1, "Pilih produk."),
    price: z.number({ message: "Harga modal harus berupa angka." }).int("Harga modal harus bilangan bulat.").min(0, "Harga modal tidak boleh negatif.").max(MAX_PARTNER_COST_PRICE, "Harga modal terlalu besar."),
    effectiveFrom: z.string().trim().min(1, "Tanggal mulai wajib diisi."),
});

class PartnerPriceError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = "PartnerPriceError";
    }
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    try {
        const partner = await prisma.partner.findUnique({
            where: { id },
            include: { user: { select: { name: true, email: true } } },
        });
        if (!partner) return NextResponse.json({ message: "Mitra tidak ditemukan." }, { status: 404 });

        const now = new Date();
        const [products, priceRows] = await Promise.all([
            prisma.product.findMany({
                where: { isActive: true },
                orderBy: { name: "asc" },
                select: { id: true, name: true, price: true, size: true, flavor: true, image: true },
            }),
            prisma.partnerProductPrice.findMany({
                where: { partnerId: id },
                orderBy: { effectiveFrom: "desc" },
                include: { product: { select: { name: true } } },
            }),
        ]);

        // Current effective cost per product: the active custom price, else the
        // catalog price (F-5 fallback remains a pending business decision).
        const activeByProduct = new Map<string, (typeof priceRows)[number]>();
        for (const row of priceRows) {
            if (!activeByProduct.has(row.productId) && getPartnerPriceStatus(row.effectiveFrom, row.effectiveTo, now) === "Aktif") {
                activeByProduct.set(row.productId, row);
            }
        }

        const productList = products.map((product) => {
            const active = activeByProduct.get(product.id);
            return {
                id: product.id,
                name: product.name,
                price: product.price,
                size: product.size,
                flavor: product.flavor,
                image: product.image,
                costPrice: active ? active.price : product.price,
                hasCustomPrice: Boolean(active),
                effectiveFrom: active ? active.effectiveFrom : null,
                effectiveTo: active ? active.effectiveTo : null,
            };
        });

        const history = priceRows.map((row) => ({
            id: row.id,
            productId: row.productId,
            productName: row.product.name,
            price: row.price,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
            status: getPartnerPriceStatus(row.effectiveFrom, row.effectiveTo, now),
            createdAt: row.createdAt,
        }));

        return NextResponse.json({
            partner: {
                id: partner.id,
                partnerCode: partner.partnerCode,
                displayName: partner.displayName,
                businessName: partner.businessName,
                status: partner.status,
                user: partner.user ? { name: partner.user.name, email: partner.user.email } : null,
            },
            products: productList,
            history,
        });
    } catch (error) {
        console.error("admin_partner_prices_list_failed", {
            category: "admin_partner_prices_list",
            name: error instanceof Error ? error.name : "UnknownError",
        });
        return NextResponse.json({ message: "Harga mitra gagal dimuat. Silakan coba lagi." }, { status: 500 });
    }
}

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const admin = await getCurrentAdmin();
    if (!admin) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    const { id } = await params;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ message: "Payload tidak valid." }, { status: 400 });
    }

    const parsed = priceSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ message: parsed.error.issues[0]?.message || "Data tidak valid." }, { status: 400 });
    }

    const { productId, price, effectiveFrom } = parsed.data;
    const effectiveFromDate = parseEffectiveFrom(effectiveFrom);
    if (!effectiveFromDate) {
        return NextResponse.json({ message: "Tanggal mulai tidak valid." }, { status: 400 });
    }

    try {
        const created = await prisma.$transaction(async (tx) => {
            const partner = await tx.partner.findUnique({ where: { id } });
            if (!partner) throw new PartnerPriceError(404, "Mitra tidak ditemukan.");
            if (partner.status !== "ACTIVE") throw new PartnerPriceError(409, "Harga modal hanya dapat ditetapkan untuk mitra berstatus Aktif.");

            const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, name: true, isActive: true } });
            if (!product) throw new PartnerPriceError(404, "Produk tidak ditemukan.");
            if (!product.isActive) throw new PartnerPriceError(409, "Produk nonaktif tidak dapat diberi harga khusus.");

            // Serialize per (partner, product) so two admins cannot concurrently
            // schedule two overlapping open prices (the schema has no unique
            // constraint on (partnerId, productId) by design).
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`price:${id}:${productId}`}))`;

            const latest = await tx.partnerProductPrice.findFirst({
                where: { partnerId: id, productId },
                orderBy: { effectiveFrom: "desc" },
            });

            // New prices always move forward in time. This rejects same-date
            // duplicates and prevents inserting a price before a scheduled future
            // one, which would otherwise create ambiguous overlaps.
            if (latest && effectiveFromDate.getTime() <= latest.effectiveFrom.getTime()) {
                throw new PartnerPriceError(409, "Sudah ada harga dengan tanggal mulai yang sama atau lebih akhir. Gunakan tanggal setelah harga terakhir.");
            }

            // Close the current open-ended "head" price at the new effectiveFrom so
            // history is preserved and there is never more than one open price.
            const openHead = await tx.partnerProductPrice.findFirst({
                where: { partnerId: id, productId, effectiveTo: null },
                orderBy: { effectiveFrom: "desc" },
            });
            if (openHead && openHead.id !== latest?.id) {
                // Pre-existing data anomaly: an open price sits behind a later price.
                // We still close it safely, but never mass-correct historical data.
                console.warn("partner_price_open_head_misaligned", { partnerId: id, productId, openHeadId: openHead.id, latestId: latest?.id });
            }
            if (openHead) {
                await tx.partnerProductPrice.update({
                    where: { id: openHead.id },
                    data: { effectiveTo: effectiveFromDate },
                });
            }

            return tx.partnerProductPrice.create({
                data: {
                    partnerId: id,
                    productId,
                    price,
                    effectiveFrom: effectiveFromDate,
                    effectiveTo: null,
                },
                include: { product: { select: { name: true } } },
            });
        });

        return NextResponse.json(
            {
                message: "Harga modal berhasil disimpan.",
                price: {
                    id: created.id,
                    productId: created.productId,
                    productName: created.product.name,
                    price: created.price,
                    effectiveFrom: created.effectiveFrom,
                    effectiveTo: created.effectiveTo,
                    status: getPartnerPriceStatus(created.effectiveFrom, created.effectiveTo),
                },
            },
            { status: 201 }
        );
    } catch (error) {
        if (error instanceof PartnerPriceError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        console.error("admin_partner_price_create_failed", {
            category: "admin_partner_price_create",
            name: error instanceof Error ? error.name : "UnknownError",
            message: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json({ message: "Harga modal gagal disimpan. Silakan coba lagi." }, { status: 500 });
    }
}

