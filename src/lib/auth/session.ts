import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./token";

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

/**
 * Barreira de autorização no servidor. Deve ser chamada no início de toda
 * página, ação e rota administrativa — o proxy é apenas a primeira camada.
 */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}
