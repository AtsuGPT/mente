import "server-only";

/**
 * Limitador simples em memória para tentativas de login.
 * Suficiente para uma instância única; com várias instâncias, troque por um
 * armazenamento compartilhado (Redis, tabela no banco etc.).
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Entry = { count: number; resetAt: number };
const attempts = new Map<string, Entry>();

function prune(now: number) {
  if (attempts.size < 500) return;
  for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
}

export function checkLoginAllowed(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  prune(now);
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) return { allowed: true, retryAfterSeconds: 0 };
  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function registerLoginFailure(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
