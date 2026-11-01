import { jwtVerify, SignJWT } from "jose";
import { ROLES, type Role } from "./role";

/**
 * Assinatura e verificação do token de sessão. Sem dependências do Next,
 * para poder ser usado tanto no proxy quanto nas rotas do servidor.
 */

export const SESSION_COOKIE = "mm_session";
export const ACCESS_COOKIE = "mm_access";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 dias

export type SessionPayload = { email: string };

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(email: string, secret: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
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

export type MobilePayload = { role: Role; email?: string };

export async function signMobileToken(payload: MobilePayload, secret: string): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("mobile")
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
      subject: "mobile",
    });
    const role = payload.role;
    if (role !== ROLES.GUEST && role !== ROLES.INTIMATE && role !== ROLES.ADMIN) return null;
    return typeof payload.email === "string" ? { role, email: payload.email } : { role };
  } catch {
    return null;
  }
}

export async function signAccessToken(role: Role, secret: string): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("site-access")
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

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
