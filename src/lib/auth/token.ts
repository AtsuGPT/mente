import { jwtVerify, SignJWT } from "jose";

/**
 * Assinatura e verificação do token de sessão. Sem dependências do Next,
 * para poder ser usado tanto no proxy quanto nas rotas do servidor.
 */

export const SESSION_COOKIE = "mm_session";
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
