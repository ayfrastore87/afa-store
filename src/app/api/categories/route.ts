import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const categories = await prisma.category.findMany({ 
            orderBy: { name: "asc" },
            include: {
                _count: {
                    select: { products: true }
                }
            }
        });
        
        console.info("[api/categories] Success", { count: categories.length });
        
        return NextResponse.json({ success: true, data: categories });
    } catch (error) {
        // Detailed error logging for debugging
        console.error("[api/categories] Failed:", {
            error: error instanceof Error ? error.message : String(error),
            errorType: error instanceof Error ? error.name : "Unknown",
            stack: error instanceof Error && error.stack ? error.stack.substring(0, 500) : undefined,
            category: "categories_api",
        });
        
        return NextResponse.json({ 
            success: false, 
            error: "Kategori belum dapat dimuat" 
        }, { status: 500 });
    }
}