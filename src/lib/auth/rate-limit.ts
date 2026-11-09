import "server-only";

/**
 * Limitador simples em memória para tentativas de login.
 * Suficiente para uma instância única; com várias instâncias, troque por um
 * armazenamento compartilhado (Redis, tabela no banco etc.).
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * Cadastros por IP na janela: 5 por padrão. REGISTER_MAX_PER_WINDOW permite subir o limite temporariamente (ex.:
 * para criar as contas de uma simulação) sem afrouxar a proteção do login, que continua com MAX_ATTEMPTS.
 */
function maxFor(key: string) {
  if (!key.startsWith("register:")) return MAX_ATTEMPTS;
  const configured = Number(process.env.REGISTER_MAX_PER_WINDOW);
  return Number.isInteger(configured) && configured > 0 ? configured : MAX_ATTEMPTS;
}

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
  if (entry.count >= maxFor(key)) {
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
