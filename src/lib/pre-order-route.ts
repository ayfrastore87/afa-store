import "server-only";

import { NextResponse } from "next/server";
import { PreOrderError } from "@/lib/pre-order";

/**
 * Shared error mapping for every PO route: PreOrderError -> its HTTP status
 * with a safe Bahasa message; anything else -> 500 with a generic message and a
 * structured server log (never leaks internals to the browser).
 */
export function preOrderErrorResponse(error: unknown, route: string, extra: Record<string, unknown> = {}) {
    if (error instanceof PreOrderError) {
        return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
    }
    console.error("pre_order_route_failed", {
        route,
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
        ...extra,
    });
    return NextResponse.json({ message: "Terjadi kesalahan pada pre-order. Coba lagi." }, { status: 500 });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
    try {
        const body = await request.json();
        return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

export function isCuidLike(value: string) {
    return /^[a-z0-9]{20,40}$/i.test(value);
}
