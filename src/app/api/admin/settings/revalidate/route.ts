import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
// Next.js 16 requires the second `profile` arg on revalidateTag (no longer optional in the TS
// type signature). `"max"` is the value recommended in the deprecation notice for single-arg
// usage, and it is safe in Route Handlers — unlike `updateTag` which hard-throws in routes.
import { getCurrentAdmin } from "@/lib/server-auth";

export const runtime = "nodejs";

/** POST /api/admin/settings/revalidate
 *  Admin-only cache invalidation for settings tag. */
export async function POST() {
    const admin = await getCurrentAdmin();
    if (!admin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    revalidateTag("settings", "max");
    revalidatePath("/", "layout");
    return NextResponse.json({ revalidated: true });
}
