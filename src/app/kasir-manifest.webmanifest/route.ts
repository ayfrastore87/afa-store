import { buildKasirManifest } from "@/lib/kasir-pwa";

// Serves the kasir PWA manifest at /kasir-manifest.webmanifest.
// Lives OUTSIDE /kasir so the proxy never redirects the manifest fetch to the
// login page (see src/lib/kasir-pwa.ts). Pure JSON, no auth, no database.
export const dynamic = "force-static";

export function GET() {
    return new Response(JSON.stringify(buildKasirManifest()), {
        status: 200,
        headers: {
            "Content-Type": "application/manifest+json; charset=utf-8",
            "Cache-Control": "public, max-age=0, must-revalidate",
        },
    });
}
