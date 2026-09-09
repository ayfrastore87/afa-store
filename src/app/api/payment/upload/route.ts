import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function POST() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    console.warn("payment_proof_upload_blocked", { route: "/api/payment/upload", category: "secure_storage_unavailable", status: 503 });
    return NextResponse.json(
        { message: "Upload bukti pembayaran sementara tidak tersedia. Silakan hubungi dukungan." },
        { status: 503 }
    );
}
