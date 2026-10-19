import { PrismaClient } from "@prisma/client";

/**
 * عميل Prisma مفرد — يُعاد استخدام التمرير العالمي أثناء التطوير السريع.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export default db;
