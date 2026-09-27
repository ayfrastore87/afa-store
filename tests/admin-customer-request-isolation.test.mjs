import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const cart = read("../src/context/cart-context.tsx");
const wishlist = read("../src/context/wishlist-context.tsx");

test("admin routes do not probe customer cart or customer session", () => {
    for (const source of [cart, wishlist]) {
        assert.match(source, /pathname === "\/admin" \|\| pathname\.startsWith\("\/admin\/"\)/);
        assert.match(source, /if \(isAdminRoute\)/);
    }
    assert.match(cart, /if \(isAdminRoute\)[\s\S]*?return;[\s\S]*?void refreshCart\(\)/);
    assert.match(wishlist, /if \(isAdminRoute\)[\s\S]*?return;[\s\S]*?void hasAuthenticatedUser\(\)/);
});