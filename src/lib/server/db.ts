// Prisma client singleton. In dev, Vite's module reload can otherwise spin
// up a new PrismaClient (and a new DB connection) on every file change —
// stashing it on `globalThis` avoids that.
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = db;
}
