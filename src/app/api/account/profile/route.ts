import { NextResponse } from "next/server";
import { getCurrentUser, publicUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { name, email, phone, image } = await request.json();
    const updated = await prisma.user.update({
        where: { id: user.id },
        data: { name, email: email?.toLowerCase(), phone, image },
    });

    return NextResponse.json({ user: publicUser(updated) });
}