import { checkCredentials } from "@/lib/auth/credentials";
import { MOBILE_TOKEN_MAX_AGE_SECONDS, signMobileToken } from "@/lib/auth/token";
import { env } from "@/lib/env";
import { clientIp, error, json } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Login do app: mesmas credenciais da tela /entrar; devolve um token Bearer. */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return error("Pedido inválido.", 413);

  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Pedido inválido.", 400);
  }

  const result = await checkCredentials(body.username, body.password, clientIp(request));
  if (!result.ok) return error(result.error, result.status);

  const token = await signMobileToken({ role: result.role, email: result.email }, env().SESSION_SECRET);
  return json({ token, role: result.role, isAdmin: result.role === "ADMIN", expiresIn: MOBILE_TOKEN_MAX_AGE_SECONDS });
}

export { preflight as OPTIONS } from "../../_lib/http";
