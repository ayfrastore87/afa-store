import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/app/globals.css");
const adminPanels = read("../src/components/admin/AdminAdvancedPanels.tsx");

test("night palette exposes primary, secondary, muted and placeholder text tokens", () => {
  assert.match(css, /--night-text:\s*#F2EDE3/);
  assert.match(css, /--night-text-secondary:\s*#D8D2C5/);
  assert.match(css, /--night-text-muted:\s*#AAA394/);
  assert.match(css, /--night-placeholder:\s*#929B94/);
});

test("night palette exposes the required surface hierarchy", () => {
  assert.match(css, /--night-bg:\s*#07150F/);
  assert.match(css, /--night-surface:\s*#0E2118/);
  assert.match(css, /--night-surface-elevated:\s*#142A20/);
  assert.match(css, /--night-surface-hover:\s*#1C392B/);
  assert.match(css, /--night-input:\s*#10241B/);
});

test("admin advanced cards and testimonial statistics have dark-scoped readable styling", () => {
  assert.match(adminPanels, /admin-advanced-card/);
  assert.match(adminPanels, /Manajemen Testimoni Pelanggan/);
  assert.match(adminPanels, /label: "Semua"[\s\S]*label: "Pending"[\s\S]*label: "Verified"[\s\S]*label: "Published"/);
  assert.match(css, /html\[data-theme="dark"\] \.admin-route-shell \.admin-advanced-card\s*\{/);
  assert.match(css, /\.admin-advanced-card p,[\s\S]*color: var\(--night-text-secondary\) !important/);
});

test("night form controls use input, text, placeholder and focus tokens", () => {
  assert.match(css, /html\[data-theme="dark"\] \.admin-route-shell :where\(input, select, textarea, \[role="combobox"\]\)[\s\S]*background-color: var\(--night-input\)[\s\S]*color: var\(--night-text\)/);
  assert.match(css, /::placeholder\s*\{[\s\S]*color: var\(--night-placeholder/);
  assert.match(css, /select option\s*\{[\s\S]*background: var\(--night-surface-elevated\)[\s\S]*color: var\(--night-text\)/);
});

test("media safety rules preserve product and category imagery without global image filters", () => {
  assert.match(css, /\.night-image-stage img,[\s\S]*\.night-category-image-stage img\s*\{\s*filter: none !important;\s*opacity: 1 !important;\s*mix-blend-mode: normal !important;/);
  assert.doesNotMatch(css, /html\[data-theme="dark"\][^{]*\bimg\b[^{]*\{[^}]*filter:\s*(?:invert|grayscale|brightness)\(/);
});

test("readability additions are dark-scoped and do not redefine light root colors", () => {
  const advancedRules = css.slice(css.indexOf("/* Admin advanced panels include"));
  assert.ok(advancedRules.length > 0);
  assert.doesNotMatch(advancedRules, /(^|\n)(?!html\[data-theme="dark"\])\s*\.admin-advanced-card\s*\{/);
  assert.match(css, /body\[data-theme="dark"\]/);
});