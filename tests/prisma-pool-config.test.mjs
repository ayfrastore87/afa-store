import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const prismaSource = fs.readFileSync(new URL("../src/lib/prisma.ts", import.meta.url), "utf8");

test("Prisma uses one shared serverless-safe pg pool configuration", () => {
    assert.equal((prismaSource.match(/new PrismaClient\s*\(/g) ?? []).length, 1);
    assert.equal((prismaSource.match(/new PrismaPg\s*\(/g) ?? []).length, 1);
    assert.match(prismaSource, /globalForPrisma\.prisma \?\? new PrismaClient/);
    assert.match(prismaSource, /max:\s*1/);
    assert.match(prismaSource, /idleTimeoutMillis:\s*10_000/);
    assert.match(prismaSource, /connectionTimeoutMillis:\s*5_000/);
    assert.match(prismaSource, /allowExitOnIdle:\s*true/);
    assert.doesNotMatch(prismaSource, /\$disconnect\s*\(/);
});