import "server-only";
import { isIP } from "node:net";
import { getAccessRole, getSession } from "@/lib/auth/session";
import { ROLES, type Role } from "@/lib/auth/role";

/**
 * Utilitários das rotas /api/mobile. A autenticação vem do token Bearer,
 * lido por getSession()/getAccessRole() quando não há cookie.
 */

/**
 * O app nativo não precisa de CORS (é regra de navegador). MOBILE_WEB_ORIGIN liga
 * o CORS só para testar o app no navegador (expo start --web); sem ela, nada muda.
 * A autenticação é por Bearer (nunca cookie), então liberar a origem não expõe sessões.
 */
function corsHeaders(): Record<string, string> {
  const origin = process.env.MOBILE_WEB_ORIGIN;
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    Vary: "Origin",
  };
}

/** Resposta ao "preflight" do navegador; as rotas reexportam como OPTIONS. */
export function preflight() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  return Response.json(data, { ...init, headers });
}

export function error(message: string, status: number, extra: Record<string, unknown> = {}) {
  return json({ error: message, ...extra }, { status });
}

/** Mesmo critério do proxy: cf-connecting-ip é confiável atrás da Cloudflare. */
export function clientIp(request: Request): string {
  const raw =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip");
  const ip = raw?.trim().replace(/^::ffff:/i, "").toLowerCase();
  return ip && isIP(ip) ? ip : "desconhecido";
}

/** Papel de quem chama; sem token válido, a resposta é 401 (o app volta ao login). */
export async function requireRole(): Promise<Role | Response> {
  const role = await getAccessRole();
  return role ?? error("Sessão expirada. Entre novamente.", 401);
}

export async function requireAdminRequest(): Promise<true | Response> {
  return (await getSession()) ? true : error("Apenas o administrador pode fazer isso.", 403);
}

export function isAdminRole(role: Role) {
  return role === ROLES.ADMIN;
}
