import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { burnPasswordCheck, verifyPassword } from "@/lib/auth/password";
import { checkLoginAllowed, clearLoginFailures, registerLoginFailure } from "@/lib/auth/rate-limit";
import { ROLES, type Role } from "@/lib/auth/role";

/**
 * Mesmas regras de accessLoginAction (lib/auth/login.ts), para o app mobile.
 * Fica fora de login.ts porque lá tudo que é exportado vira Server Action.
 */

export type CredentialsResult =
  | { ok: true; role: Role; email?: string }
  | { ok: false; error: string; status: number };

function sameText(a: string, b: string) {
  const left = Buffer.from(a.trim().toLocaleLowerCase("en-US"));
  const right = Buffer.from(b.trim().toLocaleLowerCase("en-US"));
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function checkCredentials(rawUsername: unknown, rawPassword: unknown, ip: string): Promise<CredentialsResult> {
  const key = `mobile:${ip}`;
  const gate = checkLoginAllowed(key);
  if (!gate.allowed) {
    const minutes = Math.max(1, Math.ceil(gate.retryAfterSeconds / 60));
    return { ok: false, error: `Muitas tentativas. Tente novamente em ${minutes} min.`, status: 429 };
  }

  const username = String(rawUsername ?? "").trim().slice(0, 254);
  const password = String(rawPassword ?? "");
  if (username.length < 1 || password.length < 4 || password.length > 1024) {
    registerLoginFailure(key);
    return { ok: false, error: "Usuário ou senha incorretos.", status: 401 };
  }

  let config;
  try {
    config = env();
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Configuração do servidor incompleta.", status: 500 };
  }

  const isAdmin = sameText(username, config.ADMIN_EMAIL);
  const siteUsername = process.env.SITE_USERNAME?.trim();
  const sitePasswordHash = process.env.SITE_PASSWORD_HASH;
  const isSiteUser = !!siteUsername && !!sitePasswordHash && sameText(username, siteUsername);
  let passwordOk = false;
  if (isAdmin) passwordOk = await verifyPassword(password, config.ADMIN_PASSWORD_HASH);
  else if (isSiteUser) passwordOk = await verifyPassword(password, sitePasswordHash);
  else await burnPasswordCheck(password);

  if (!passwordOk || (!isAdmin && !isSiteUser)) {
    registerLoginFailure(key);
    return { ok: false, error: "Usuário ou senha incorretos.", status: 401 };
  }

  clearLoginFailures(key);
  return isAdmin ? { ok: true, role: ROLES.ADMIN, email: config.ADMIN_EMAIL } : { ok: true, role: ROLES.INTIMATE };
}
