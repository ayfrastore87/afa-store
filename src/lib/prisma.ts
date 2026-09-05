import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL is required to initialize Prisma.");
}

const caPath = path.join(process.cwd(), "certs", "prod-ca-2021.crt");
const ca = fs.readFileSync(caPath, "utf8");
const runtimeUrl = new URL(connectionString);
runtimeUrl.searchParams.delete("sslmode");

const adapter = new PrismaPg({
    connectionString: runtimeUrl.toString(),
    ssl: {
        ca,
        rejectUnauthorized: true,
    },
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;