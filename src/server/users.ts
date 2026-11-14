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

/**
 * Conta correspondente a uma credencial do .env, criada (uma vez) no primeiro login.
 *
 * A conta é achada pelo nome de usuário e, se ele tiver mudado, pelo papel do .env (legacyKind): trocar o nome de
 * usuário ou de exibição no banco não pode criar outra identidade. Antes, só o nome de usuário contava: quando o @ do
 * administrador mudou de e-mail para "atsu", o login seguinte criou uma segunda conta de administrador com o e-mail,
 * e os posts, conversas e memórias novos foram para ela (unificadas em 14/11/2026).
 */
export async function ensureLegacyUser(kind: LegacyKind, rawUsername: string) {
  const username = normalizeUsername(rawUsername);
  const existing =
    (await db.user.findUnique({ where: { username }, select: publicUserSelect })) ??
    (await db.user.findFirst({ where: { legacyKind: kind }, orderBy: { createdAt: "asc" }, select: publicUserSelect }));
  const user = existing
    ? existing.legacyKind === kind
      ? existing
      : await db.user.update({ where: { id: existing.id }, data: { legacyKind: kind }, select: publicUserSelect })
    : await db.user.create({ data: { username, displayName: kind === "ADMIN" ? site.author : username, legacyKind: kind }, select: publicUserSelect });

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
