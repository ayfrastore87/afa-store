import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";

const ROOT = fileURLToPath(new URL("../src", import.meta.url));
function read(rel) {
    const p = `${ROOT}/${rel}`;
    assert.ok(existsSync(p), `File not found: ${p}`);
    return readFileSync(p, "utf8");
}

test("settings-loader: exists and exports getPublicSettings", () => {
    const content = read("lib/settings-loader.ts");
    assert.ok(content.includes('import "server-only"'), "Must import server-only");
    assert.ok(content.includes("export async function getPublicSettings"), "Must export getPublicSettings");
    assert.ok(content.includes('"settings"') && content.includes("tags"), "Must use settings cache tag");
});

test("layout.tsx: generateMetadata uses getPublicSettings", () => {
    const content = read("app/layout.tsx");
    assert.ok(!content.includes("export const metadata: Metadata"), "Must NOT have static export const metadata");
    assert.ok(content.includes("export async function generateMetadata"), "Must export generateMetadata");
    assert.ok(content.includes("getPublicSettings"), "Must call getPublicSettings");
    assert.ok(content.includes('from "@/lib/settings-loader"'), "Must import from settings-loader");
});

test("revalidate route: revalidateTag + admin guard", () => {
    const content = read("app/api/admin/settings/revalidate/route.ts");
    assert.ok(content.includes("revalidateTag"), "Must call revalidateTag");
    assert.ok(content.includes("revalidatePath"), "Must call revalidatePath");
    assert.ok(content.includes("getCurrentAdmin"), "Must guard with getCurrentAdmin");
    // Next.js 16: revalidateTag requires 2 args — call is revalidateTag("settings", "max")
    assert.ok(content.includes('revalidateTag("settings",') || content.includes('revalidateTag("settings", '), "Must revalidate settings tag with Next.js 16 two-arg API");
});

test("image route: admin guard + magic bytes + settings-only deletion", () => {
    const content = read("app/api/admin/settings/image/route.ts");
    assert.ok(content.includes("getCurrentAdmin"), "Must guard with getCurrentAdmin");
    assert.ok(content.includes("hasImageSignature"), "Must validate magic bytes");
    assert.ok(content.includes("export async function POST"), "Must export POST");
    assert.ok(content.includes("export async function DELETE"), "Must export DELETE");
    assert.ok(content.includes('startsWith("settings/")'), "DELETE must check settings/ prefix");
});

test("floating-whatsapp: accepts whatsapp prop override", () => {
    const content = read("components/floating-whatsapp.tsx");
    assert.ok(content.includes("whatsapp?: string"), "Must accept whatsapp prop");
    assert.ok(content.includes("whatsapp.replace"), "Must use whatsapp prop for href");
});

test("FooterLocationMap: mapsUrl prop and resolvedMapsUrl in href", () => {
    const content = read("components/footer/FooterLocationMap.tsx");
    assert.ok(content.includes("mapsUrl?: string"), "Must have mapsUrl prop");
    assert.ok(content.includes("resolvedMapsUrl"), "Must resolve mapsUrl");
    assert.ok(content.includes("href={resolvedMapsUrl}"), "Must use resolvedMapsUrl");
});

test("AdminAdvancedPanels: image upload + revalidate + pendingDeletes", () => {
    const content = read("components/admin/AdminAdvancedPanels.tsx");
    assert.ok(content.includes("SettingsImageUploader"), "Must include SettingsImageUploader");
    assert.ok(content.includes("optimizeSettingsImage"), "Must import optimizeSettingsImage");
    assert.ok(content.includes("uploadSettingsImage"), "Must import uploadSettingsImage");
    assert.ok(content.includes("extractSettingsStoragePath"), "Must import extractSettingsStoragePath");
    assert.ok(content.includes("pendingDeletesRef"), "Must have pendingDeletes ref");
    assert.ok(content.includes("revalidatePublicCache"), "Must call revalidatePublicCache");
    assert.ok(content.includes("/api/admin/settings/revalidate"), "Must call revalidate endpoint");
    assert.ok(content.includes("flushPendingDeletes"), "Must flush pending deletes");
});

test("settings-image-upload-client: core exports and safety guards", () => {
    const content = read("lib/settings-image-upload-client.ts");
    assert.ok(content.includes("export async function optimizeSettingsImage"), "Must export optimizeSettingsImage");
    assert.ok(content.includes("export async function uploadSettingsImage"), "Must export uploadSettingsImage");
    assert.ok(content.includes("export function extractSettingsStoragePath"), "Must export extractSettingsStoragePath");
    assert.ok(content.includes("QUALITY_STEPS"), "Must have bounded quality steps");
});

test("public settings API: exists and has allowed keys whitelist", () => {
    const content = read("app/api/public/settings/route.ts");
    assert.ok(content.includes("export async function GET"), "Must export GET");
    assert.ok(content.includes("ALLOWED_KEYS"), "Must have ALLOWED_KEYS");
    assert.ok(content.includes("homeBanner"), "Must include homeBanner");
    assert.ok(content.includes("whatsapp"), "Must include whatsapp");
});

test("premium-footer: reads settings from Supabase", () => {
    const content = read("components/premium-footer.tsx");
    assert.ok(content.includes("useFooterSettings"), "Must have useFooterSettings hook");
    assert.ok(content.includes("createBrowserClient"), "Must use createBrowserClient");
    assert.ok(content.includes("logoSrc"), "Must derive logoSrc from settings");
    assert.ok(content.includes("mapsUrl={st.maps"), "Must pass maps URL to FooterLocationMap");
});

