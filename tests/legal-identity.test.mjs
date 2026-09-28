// legal-identity.test.mjs
// Ensures Meta Business Verification requirements are met:
// IRMA RATNA MARYANI, NIB 2411220051724, and phone 087770000883
// must be present as plain HTML text — not gated by JS or auth.
// Run: node --test tests/legal-identity.test.mjs

import { readFileSync } from "node:fs";
import { ok, match, doesNotMatch } from "node:assert";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
function read(rel) { return readFileSync(path.join(root, rel), "utf8"); }

const footer      = read("src/components/premium-footer.tsx");
const layout      = read("src/app/layout.tsx");
const tentangPage = read("src/app/tentang-kami/page.tsx");

// ── 1. Footer legal strip ─────────────────────────────────────────────────────
test("footer: legal name IRMA RATNA MARYANI in markup", () => {
  match(footer, /IRMA RATNA MARYANI/);
});
test("footer: NIB 2411220051724 in markup", () => {
  match(footer, /2411220051724/);
});
test("footer: legal strip not hidden (no display:none / opacity-0)", () => {
  // The legal strip must never carry display:none or opacity-0 on the same element
  doesNotMatch(footer, /IRMA RATNA MARYANI[\s\S]{0,80}display:none/);
  doesNotMatch(footer, /IRMA RATNA MARYANI[\s\S]{0,80}opacity-0/);
});
test("footer: link to /tentang-kami present", () => {
  match(footer, /href="\/tentang-kami"/);
  match(footer, /Informasi Legal/);
});

// ── 2. JSON-LD structured data in layout ─────────────────────────────────────
test("layout: LocalBusiness JSON-LD present", () => {
  match(layout, /application\/ld\+json/);
  match(layout, /LocalBusiness/);
});
test("layout: JSON-LD legalName IRMA RATNA MARYANI", () => {
  match(layout, /legalName.*IRMA RATNA MARYANI/);
});
test("layout: JSON-LD telephone", () => {
  match(layout, /\+6287770000883/);
});
test("layout: JSON-LD name AFA STORE", () => {
  match(layout, /"name".*"AFA STORE"/);
});
test("layout: JSON-LD streetAddress present", () => {
  match(layout, /Griya Praja Mandiri/);
});
test("layout: JSON-LD not async (no DB dependency)", () => {
  // Must be a const at module level — not inside an async function
  match(layout, /^const LOCAL_BUSINESS_JSONLD/m);
});

// ── 3. /tentang-kami page ─────────────────────────────────────────────────────
test("tentang-kami: is a Server Component (no 'use client')", () => {
  doesNotMatch(tentangPage, /^["']use client["']/m);
});
test("tentang-kami: IRMA RATNA MARYANI in markup", () => {
  match(tentangPage, /IRMA RATNA MARYANI/);
});
test("tentang-kami: NIB 2411220051724 in markup", () => {
  match(tentangPage, /2411220051724/);
});
test("tentang-kami: phone 087770000883 present", () => {
  match(tentangPage, /087770000883/);
});
test("tentang-kami: wa.me link with country code", () => {
  match(tentangPage, /wa\.me\/6287770000883/);
});
test("tentang-kami: legal address present", () => {
  match(tentangPage, /Griya Praja Mandiri/);
  match(tentangPage, /Cilegon/);
  match(tentangPage, /Banten 42422/);
});
test("tentang-kami: uses <address> element for address", () => {
  match(tentangPage, /<address/);
});
test("tentang-kami: AFA STORE brand heading present", () => {
  match(tentangPage, /AFA STORE/);
});
test("tentang-kami: metadata title contains legal name or legal info", () => {
  match(tentangPage, /Informasi Legal.*AFA STORE|AFA STORE.*Informasi Legal/);
});
test("tentang-kami: canonical URL set", () => {
  match(tentangPage, /afastore\.online\/tentang-kami/);
});
test("tentang-kami: link back to home", () => {
  match(tentangPage, /href="\/"/);
});
test("tentang-kami: includes PremiumFooter", () => {
  match(tentangPage, /PremiumFooter/);
});
test("tentang-kami: name IRMA RATNA MARYANI NOT in display:none context", () => {
  doesNotMatch(tentangPage, /IRMA RATNA MARYANI[\s\S]{0,100}display:none/);
});

// ── 4. Consistency check — name must be spelled the same everywhere ───────────
test("cross-file: legal name spelled consistently", () => {
  const name = "IRMA RATNA MARYANI";
  match(footer,      new RegExp(name));
  match(layout,      new RegExp(name));
  match(tentangPage, new RegExp(name));
  // Ensure no alternative misspelling exists
  doesNotMatch(footer,      /IRMA RATNA MARY[^A]/);
  doesNotMatch(layout,      /IRMA RATNA MARY[^A]/);
  doesNotMatch(tentangPage, /IRMA RATNA MARY[^A]/);
});
