import { ROLES } from "@/lib/auth/role";
import { MOBILE_TOKEN_MAX_AGE_SECONDS, signMobileToken } from "@/lib/auth/token";
import { env } from "@/lib/env";
import { error, json } from "../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Equivalente a "Entrar como convidado": só posts públicos. */
export async function POST() {
  let secret: string;
  try {
    secret = env().SESSION_SECRET;
  } catch (cause) {
    console.error(cause);
    return error("Configuração do servidor incompleta.", 500);
  }
  const token = await signMobileToken({ role: ROLES.GUEST }, secret);
  return json({ token, role: ROLES.GUEST, isAdmin: false, expiresIn: MOBILE_TOKEN_MAX_AGE_SECONDS });
}

export { preflight as OPTIONS } from "../../_lib/http";
