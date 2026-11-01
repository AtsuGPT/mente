import { registerAccount } from "@/lib/auth/credentials";
import { MOBILE_TOKEN_MAX_AGE_SECONDS, signMobileToken } from "@/lib/auth/token";
import { env } from "@/lib/env";
import { clientIp, error, json, readJson } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cria uma conta e já devolve o token (a pessoa entra em seguida). */
export async function POST(request: Request) {
  const body = await readJson(request, 4096);
  if (body instanceof Response) return body;
  const result = await registerAccount(body, clientIp(request));
  if (!result.ok) return error(result.error, result.status, result.fieldErrors ? { fieldErrors: result.fieldErrors } : {});
  const token = await signMobileToken({ uid: result.user.id }, env().SESSION_SECRET);
  return json({ token, user: result.user, expiresIn: MOBILE_TOKEN_MAX_AGE_SECONDS }, { status: 201 });
}

export { preflight as OPTIONS } from "../../_lib/http";
