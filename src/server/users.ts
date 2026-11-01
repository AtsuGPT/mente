import "server-only";
import { db } from "@/lib/db";
import { site } from "@/config/site";
import { Prisma } from "@/generated/prisma";
import { DEFAULT_ENVIRONMENT_ID } from "./scope";

/**
 * Contas do app. As credenciais do .env (ADMIN_EMAIL e SITE_USERNAME) continuam valendo:
 * no primeiro login viram contas "legadas" (sem senha no banco, autenticadas pelo .env)
 * já participantes do ambiente original: o administrador como proprietário e o
 * leitor como VIEWER, que vê os pensamentos privados, como antes.
 */

export type LegacyKind = "ADMIN" | "SITE";

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase().slice(0, 254);
}

/** Nomes das credenciais do .env: ninguém pode criar uma conta com eles. */
export function reservedUsernames(): string[] {
  return [process.env.ADMIN_EMAIL, process.env.SITE_USERNAME].filter((v): v is string => !!v).map(normalizeUsername);
}

export const publicUserSelect = { id: true, username: true, displayName: true, legacyKind: true, createdAt: true } satisfies Prisma.UserSelect;

export async function findUserById(id: string) {
  return db.user.findUnique({ where: { id }, select: publicUserSelect });
}

export async function findUserForLogin(username: string) {
  return db.user.findUnique({ where: { username }, select: { ...publicUserSelect, passwordHash: true } });
}

export async function createUser(input: { username: string; displayName: string; passwordHash: string }) {
  try {
    const user = await db.user.create({ data: input, select: publicUserSelect });
    return { ok: true as const, user };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false as const, fieldErrors: { username: ["Este nome de usuário já está em uso."] } };
    }
    throw error;
  }
}

/** Conta correspondente a uma credencial do .env, criada (uma vez) no primeiro login. */
export async function ensureLegacyUser(kind: LegacyKind, rawUsername: string) {
  const username = normalizeUsername(rawUsername);
  const user = await db.user.upsert({
    where: { username },
    update: { legacyKind: kind },
    create: { username, displayName: kind === "ADMIN" ? site.author : username, legacyKind: kind },
    select: publicUserSelect,
  });

  const role = kind === "ADMIN" ? "OWNER" : "VIEWER";
  await db.membership.upsert({
    where: { environmentId_userId: { environmentId: DEFAULT_ENVIRONMENT_ID, userId: user.id } },
    update: kind === "ADMIN" ? { role } : {},
    create: { environmentId: DEFAULT_ENVIRONMENT_ID, userId: user.id, role },
  });
  if (kind === "ADMIN") {
    await db.environment.updateMany({ where: { id: DEFAULT_ENVIRONMENT_ID, ownerId: null }, data: { ownerId: user.id } });
  }
  return user;
}
