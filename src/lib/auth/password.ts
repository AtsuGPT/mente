import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Formato armazenado: scrypt:N:r:p:salt:hash  (base64url, sem "$" para não
 * ser interpolado pelo carregador de .env). Gerado por scripts/hash-password.mjs.
 */

function scryptAsync(password: string, salt: Buffer, keylen: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

// Hash descartável usado quando o e-mail não confere, para que o tempo de
// resposta não revele se o e-mail existe.
let dummy: string | undefined;
async function dummyHash() {
  if (!dummy) {
    const salt = randomBytes(16);
    const key = await scryptAsync("dummy", salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    dummy = ["scrypt", 16384, 8, 1, salt.toString("base64url"), key.toString("base64url")].join(":");
  }
  return dummy;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (![N, r, p].every(Number.isInteger)) return false;

  const salt = Buffer.from(saltB64, "base64url");
  const expected = Buffer.from(hashB64, "base64url");
  if (expected.length === 0) return false;

  try {
    const actual = await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r + 1024 * 1024,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Compara a senha com um hash fictício, apenas para equalizar o tempo de resposta. */
export async function burnPasswordCheck(password: string) {
  await verifyPassword(password, await dummyHash());
}
