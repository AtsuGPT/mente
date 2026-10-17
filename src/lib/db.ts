import "server-only";
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  if (!process.env.DATABASE_URL?.startsWith("mongodb://") && !process.env.DATABASE_URL?.startsWith("mongodb+srv://")) {
    throw new Error("DATABASE_URL deve ser uma conexão MongoDB. Configure mongodb:// ou mongodb+srv://.");
  }
  return new PrismaClient();
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
