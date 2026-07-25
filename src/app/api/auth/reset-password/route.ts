import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
    return NextResponse.json(
        { message: "Reset password menggunakan Supabase Auth melalui halaman /reset-password." },
        { status: 410 }
    );
}
