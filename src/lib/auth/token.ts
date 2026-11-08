import { jwtVerify, SignJWT } from "jose";
import { ROLES, type Role } from "./role";

/**
 * Assinatura e verificação do token de sessão. Sem dependências do Next,
 * para poder ser usado tanto no proxy quanto nas rotas do servidor.
 */

export const SESSION_COOKIE = "mm_session";
export const ACCESS_COOKIE = "mm_access";

export type SessionPayload = { email: string };

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
): Promise<SessionPayload | null> {
  if (!token || !secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      subject: "admin",
    });
    return typeof payload.email === "string" ? { email: payload.email } : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Token do aplicativo mobile: enviado em "Authorization: Bearer".     */
/* Nunca é lido de cookie, então não é enviado sozinho pelo navegador. */
/* ------------------------------------------------------------------ */

export const MOBILE_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

/**
 * Identifica a pessoa (uid), não um papel: o papel é decidido por ambiente, a cada
 * requisição, pela participação (Membership). O subject "mobile-user" invalida os
 * tokens da versão anterior, que carregavam um papel fixo.
 */
export type MobilePayload = { uid: string };

export async function signMobileToken(payload: MobilePayload, secret: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("mobile-user")
    .setIssuedAt()
    .setExpirationTime(`${MOBILE_TOKEN_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

export async function verifyMobileToken(
  token: string | undefined,
  secret: string | undefined,
): Promise<MobilePayload | null> {
  if (!token || !secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      subject: "mobile-user",
    });
    return typeof payload.uid === "string" && payload.uid ? { uid: payload.uid } : null;
  } catch {
    return null;
  }
}

/** Cookies da primeira versão do site: só são lidos (nada mais os emite) até expirarem. */
export async function verifyAccessToken(token: string | undefined, secret: string | undefined): Promise<Role | null> {
  if (!token || !secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      subject: "site-access",
    });
    const role = payload.role;
    if (role === ROLES.GUEST || role === ROLES.INTIMATE || role === ROLES.ADMIN) return role;
    return null;
  } catch {
    return null;
  }
}
