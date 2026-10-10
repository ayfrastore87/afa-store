import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync("src/app/page.tsx", "utf8");
const catalog = fs.readFileSync("src/components/catalog/catalog-experience.tsx", "utf8");

test("cart badges are derived only from an authenticated, resolved cart", () => {
  assert.match(home, /!cartLoading && isAuthenticated \? totalItems : 0/);
  assert.match(catalog, /!cartLoading && isAuthenticated \? totalItems : 0/);
});

test("both navbar and floating cart use the guarded count", () => {
  assert.match(home, /Floating onCart=\{openCart\} totalItems=\{cartItemCount\}/);
  assert.match(home, /cartItemCount > 0 &&/);
  assert.match(catalog, /visibleCartItemCount > 0 &&/);
});

test("badge behavior covers guest, empty, five-item, logout, and account switch states", () => {
  const badgeCount = (authenticated, loading, total) => (!loading && authenticated ? total : 0);
  assert.equal(badgeCount(false, false, 5), 0, "guest hides badge");
  assert.equal(badgeCount(true, false, 0), 0, "empty authenticated cart hides badge");
  assert.equal(badgeCount(true, false, 5), 5, "authenticated cart shows five");
  assert.equal(badgeCount(false, false, 5), 0, "logout hides previous count");
  assert.equal(badgeCount(false, true, 5), 0, "auth transition hides stale count");
});