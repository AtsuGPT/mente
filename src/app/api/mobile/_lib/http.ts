import "server-only";
import { isIP } from "node:net";
import { getMobileUser } from "@/lib/auth/session";
import { isAccessError, resolveAccess, type Access, type Permissions } from "@/server/environments";

/**
 * Utilitários das rotas /api/mobile. A pessoa vem do token Bearer; o que ela pode
 * fazer vem da participação no ambiente da URL (resolveAccess), sempre no servidor.
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
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
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

/** Id da pessoa do token, ou null (visitante sem conta). */
export async function currentUserId(): Promise<string | null> {
  return (await getMobileUser())?.uid ?? null;
}

export async function requireUser(): Promise<string | Response> {
  return (await currentUserId()) ?? error("Entre com sua conta para continuar.", 401);
}

export async function readJson(request: Request, maxBytes = 16_384): Promise<Record<string, unknown> | Response> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return error("Pedido grande demais.", 413);
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : error("Pedido inválido.", 400);
  } catch {
    return error("Pedido inválido.", 400);
  }
}

export type EnvContext = { params: Promise<{ env: string }> };

/**
 * Acesso ao ambiente da URL, exigindo (opcionalmente) uma permissão.
 * 401 sem conta num ambiente privado, 403 sem participação/permissão, 404 se não existe.
 */
export async function envAccess(context: { params: Promise<{ env: string }> }, need?: keyof Permissions): Promise<Access | Response> {
  const { env } = await context.params;
  const access = await resolveAccess(env, await currentUserId());
  if (isAccessError(access)) return error(access.error, access.status);
  if (need && !access.permissions[need]) return error("Você não tem permissão para isso neste ambiente.", 403);
  return access;
}
