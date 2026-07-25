import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
    return NextResponse.json(
        { message: "Forgot password menggunakan Supabase Auth dari halaman /forgot-password." },
        { status: 410 }
    );
}
