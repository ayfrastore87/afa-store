import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function PATCH() {
    return NextResponse.json({ message: "Payment mutation is not permitted." }, { status: 403 });
}