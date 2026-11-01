import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROLES, type Role } from "./role";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import {
  ACCESS_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signAccessToken,
  signSessionToken,
  verifyAccessToken,
  verifyMobileToken,
  verifySessionToken,
  type MobilePayload,
  type SessionPayload,
} from "./token";

/** Pessoa do app mobile ("Authorization: Bearer"). Memoizado por requisição. */
export const getMobileUser = cache(async (): Promise<MobilePayload | null> => {
  const authorization = (await headers()).get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const payload = await verifyMobileToken(authorization.slice(7).trim(), process.env.SESSION_SECRET);
  if (!payload) return null;
  // A conta precisa continuar existindo.
  return (await db.user.findUnique({ where: { id: payload.uid }, select: { id: true } })) ? payload : null;
});

/**
 * Papel do app no site, só para LER o ambiente original ("mente"): participantes
 * contam como INTIMO (veem os privados), os demais como convidado. Nunca ADMIN:
 * as ações de administração do site exigem o cookie de sessão.
 */
const getMobileSiteRole = cache(async (): Promise<Role | null> => {
  const user = await getMobileUser();
  if (!user) return null;
  const member = await db.membership.findUnique({
    where: { environmentId_userId: { environmentId: "mente", userId: user.uid } },
    select: { id: true },
  });
  return member ? ROLES.INTIMATE : ROLES.GUEST;
});


export async function createSession(email: string) {
  const token = await signSessionToken(email, env().SESSION_SECRET);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function createAccessSession(role: Role) {
  const token = await signAccessToken(role, env().SESSION_SECRET);
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroyAccessSession() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Sessão atual (ou null). Memoizada por requisição. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  if (!session) return null;
  // O e-mail da sessão precisa continuar sendo o do administrador configurado.
  return session.email === process.env.ADMIN_EMAIL ? session : null;
});

export const getAccessRole = cache(async (): Promise<Role | null> => {
  const jar = await cookies();
  const role =
    (await verifyAccessToken(jar.get(ACCESS_COOKIE)?.value, process.env.SESSION_SECRET)) ??
    (await getMobileSiteRole());
  if (!role) return null;
  if (role === "ADMIN") return (await getSession()) ? role : null;
  return role;
});

/**
 * Barreira de autorização no servidor. Deve ser chamada no início de toda
 * página, ação e rota administrativa — o proxy é apenas a primeira camada.
 */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}
export async function requireIntimate(): Promise<Role> {
  const role = await getAccessRole();
  if (!role) redirect("/entrar");
  if (role !== ROLES.INTIMATE && role !== ROLES.ADMIN) {
    redirect("/");
  }
  return role;
}