import { NextResponse } from "next/server";
import { calculateSubtotal, normalizeCartItems, type CartItem } from "@/lib/cart";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

function serializeCartItem(item: { productRef: string; name: string; price: number; image: string | null; quantity: number }): CartItem {
    return {
        id: item.productRef,
        name: item.name,
        price: item.price,
        image: item.image || "/products/parcel.png",
        qty: item.quantity,
    };
}

async function getUserOrUnauthorized() {
    const user = await getCurrentUser();
    return user ? { user } : { response: NextResponse.json({ message: "Silakan login untuk menyimpan keranjang." }, { status: 401 }) };
}

async function getCart(userId: string) {
    const rows = await prisma.cartItem.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } });
    const items = rows.map(serializeCartItem);

    return { items, subtotal: calculateSubtotal(items) };
}

export async function GET() {
    const auth = await getUserOrUnauthorized();
    if ("response" in auth) return auth.response;

    return NextResponse.json(await getCart(auth.user.id));
}

export async function POST(request: Request) {
    const auth = await getUserOrUnauthorized();
    if ("response" in auth) return auth.response;

    const body = await request.json() as { item?: CartItem; items?: CartItem[] };
    const incomingItems = body.items ? normalizeCartItems(body.items) : body.item ? [body.item] : [];

    if (!incomingItems.length) {
        return NextResponse.json({ message: "Item keranjang tidak valid." }, { status: 400 });
    }

    await Promise.all(incomingItems.map((item) => prisma.cartItem.upsert({
        where: { userId_productRef: { userId: auth.user.id, productRef: item.id } },
        update: { name: item.name, price: item.price, image: item.image, quantity: { increment: item.qty } },
        create: { userId: auth.user.id, productRef: item.id, name: item.name, price: item.price, image: item.image, quantity: item.qty },
    })));

    return NextResponse.json(await getCart(auth.user.id));
}

export async function PATCH(request: Request) {
    const auth = await getUserOrUnauthorized();
    if ("response" in auth) return auth.response;

    const body = await request.json() as { id?: string; qty?: number };
    if (!body.id || typeof body.qty !== "number") {
        return NextResponse.json({ message: "Payload update keranjang tidak valid." }, { status: 400 });
    }

    if (body.qty <= 0) {
        await prisma.cartItem.deleteMany({ where: { userId: auth.user.id, productRef: body.id } });
    } else {
        await prisma.cartItem.updateMany({ where: { userId: auth.user.id, productRef: body.id }, data: { quantity: body.qty } });
    }

    return NextResponse.json(await getCart(auth.user.id));
}

export async function DELETE(request: Request) {
    const auth = await getUserOrUnauthorized();
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
        await prisma.cartItem.deleteMany({ where: { userId: auth.user.id, productRef: id } });
    } else {
        await prisma.cartItem.deleteMany({ where: { userId: auth.user.id } });
    }

    return NextResponse.json(await getCart(auth.user.id));
}