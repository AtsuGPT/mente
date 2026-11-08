import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/auth/password";
import { checkLoginAllowed, clearLoginFailures, registerLoginFailure } from "@/lib/auth/rate-limit";
import {
  createUser,
  ensureLegacyUser,
  findUserForLogin,
  normalizeUsername,
  reservedUsernames,
  USERNAME_PATTERN,
} from "@/server/users";

/**
 * Login e cadastro do app (celular e web): limite de tentativas, mensagem genérica e
 * tempo igual para usuário inexistente.
 */

type User = { id: string; username: string; displayName: string };
type Failure = { ok: false; error: string; status: number; fieldErrors?: Record<string, string[]> };

function sameText(a: string, b: string) {
  const left = Buffer.from(a.trim().toLocaleLowerCase("en-US"));
  const right = Buffer.from(b.trim().toLocaleLowerCase("en-US"));
  return left.length === right.length && timingSafeEqual(left, right);
}

function gate(key: string): Failure | null {
  const allowed = checkLoginAllowed(key);
  if (allowed.allowed) return null;
  const minutes = Math.max(1, Math.ceil(allowed.retryAfterSeconds / 60));
  return { ok: false, error: `Muitas tentativas. Tente novamente em ${minutes} min.`, status: 429 };
}

export async function checkCredentials(rawUsername: unknown, rawPassword: unknown, ip: string): Promise<{ ok: true; user: User } | Failure> {
  const key = `mobile:${ip}`;
  const blocked = gate(key);
  if (blocked) return blocked;

  const username = normalizeUsername(rawUsername);
  const password = String(rawPassword ?? "");
  const invalid: Failure = { ok: false, error: "Usuário ou senha incorretos.", status: 401 };
  if (username.length < 1 || password.length < 4 || password.length > 1024) {
    registerLoginFailure(key);
    return invalid;
  }

  let config;
  try {
    config = env();
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Configuração do servidor incompleta.", status: 500 };
  }

  // 1. Credenciais do .env (administrador e leitor do site).
  const siteUsername = process.env.SITE_USERNAME?.trim();
  const sitePasswordHash = process.env.SITE_PASSWORD_HASH;
  const isAdmin = sameText(username, config.ADMIN_EMAIL);
  const isSiteUser = !!siteUsername && !!sitePasswordHash && sameText(username, siteUsername);
  if (isAdmin || isSiteUser) {
    const ok = await verifyPassword(password, isAdmin ? config.ADMIN_PASSWORD_HASH : sitePasswordHash!);
    if (!ok) {
      registerLoginFailure(key);
      return invalid;
    }
    clearLoginFailures(key);
    return { ok: true, user: await ensureLegacyUser(isAdmin ? "ADMIN" : "SITE", username) };
  }

  // 2. Contas criadas no app.
  const user = await findUserForLogin(username);
  if (!user?.passwordHash) {
    await burnPasswordCheck(password);
    registerLoginFailure(key);
    return invalid;
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    registerLoginFailure(key);
    return invalid;
  }
  clearLoginFailures(key);
  return { ok: true, user: { id: user.id, username: user.username, displayName: user.displayName } };
}

export async function registerAccount(raw: { username?: unknown; displayName?: unknown; password?: unknown }, ip: string): Promise<{ ok: true; user: User } | Failure> {
  // Cada cadastro conta como uma tentativa: no máximo 5 a cada 15 minutos por IP.
  const key = `register:${ip}`;
  const blocked = gate(key);
  if (blocked) return blocked;
  registerLoginFailure(key);

  const username = normalizeUsername(raw.username);
  const displayName = String(raw.displayName ?? "").trim().slice(0, 60);
  const password = String(raw.password ?? "");
  const fieldErrors: Record<string, string[]> = {};
  if (!USERNAME_PATTERN.test(username)) fieldErrors.username = ["Use de 3 a 32 letras minúsculas, números, ponto, hífen ou sublinhado."];
  else if (reservedUsernames().includes(username)) fieldErrors.username = ["Este nome de usuário já está em uso."];
  if (!displayName) fieldErrors.displayName = ["Informe como você quer ser chamado."];
  if (password.length < 8) fieldErrors.password = ["A senha precisa ter pelo menos 8 caracteres."];
  if (password.length > 1024) fieldErrors.password = ["Senha longa demais."];
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Revise os campos destacados.", status: 422, fieldErrors };

  const created = await createUser({ username, displayName, passwordHash: await hashPassword(password) });
  if (!created.ok) return { ok: false, error: "Revise os campos destacados.", status: 422, fieldErrors: created.fieldErrors };
  return { ok: true, user: created.user };
}
