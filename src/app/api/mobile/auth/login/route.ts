import { checkCredentials } from "@/lib/auth/credentials";
import { MOBILE_TOKEN_MAX_AGE_SECONDS, signMobileToken } from "@/lib/auth/token";
import { env } from "@/lib/env";
import { clientIp, error, json, readJson } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Login do app: contas criadas no app e as credenciais do .env (administrador e leitor do site). */
export async function POST(request: Request) {
  const body = await readJson(request, 4096);
  if (body instanceof Response) return body;
  const result = await checkCredentials(body.username, body.password, clientIp(request));
  if (!result.ok) return error(result.error, result.status);
  const token = await signMobileToken({ uid: result.user.id }, env().SESSION_SECRET);
  return json({ token, user: result.user, expiresIn: MOBILE_TOKEN_MAX_AGE_SECONDS });
}

export { preflight as OPTIONS } from "../../_lib/http";
