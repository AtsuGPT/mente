import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ROLES, type Role } from "./role";
import { env } from "@/lib/env";
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

/** Token do app mobile ("Authorization: Bearer"), usado só quando não há cookie. */
const getMobileToken = cache(async (): Promise<MobilePayload | null> => {
  const authorization = (await headers()).get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return verifyMobileToken(authorization.slice(7).trim(), process.env.SESSION_SECRET);
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
  if (session) {
    // O e-mail da sessão precisa continuar sendo o do administrador configurado.
    return session.email === process.env.ADMIN_EMAIL ? session : null;
  }
  const mobile = await getMobileToken();
  if (mobile?.role === ROLES.ADMIN && mobile.email && mobile.email === process.env.ADMIN_EMAIL) {
    return { email: mobile.email };
  }
  return null;
});

export const getAccessRole = cache(async (): Promise<Role | null> => {
  const jar = await cookies();
  const role =
    (await verifyAccessToken(jar.get(ACCESS_COOKIE)?.value, process.env.SESSION_SECRET)) ??
    (await getMobileToken())?.role;
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