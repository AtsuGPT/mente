import { isIP } from "node:net";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

const VISIT_GAP_MS = 5 * 60 * 1000;
const MAX_WRITES_PER_MINUTE = 120;
const MAX_TRACKED_IPS = 5000;

const lastWriteByIp = new Map<string, number>();
let writeWindow = { startedAt: 0, count: 0 };

/** Atrás do Cloudflare, cf-connecting-ip é confiável; sem ele os demais cabeçalhos podem ser forjados. */
function clientIp(request: NextRequest): string | null {
  const raw =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-real-ip");
  const ip = raw?.trim().replace(/^::ffff:/i, "").toLowerCase();
  return ip && isIP(ip) ? ip : null;
}

function recordVisit(request: NextRequest) {
  const ip = clientIp(request);
  if (!ip) return;

  const now = Date.now();
  if (now - (lastWriteByIp.get(ip) ?? 0) < VISIT_GAP_MS) return;

  // Teto global de gravações: IPs forjados não podem inflar o banco.
  if (now - writeWindow.startedAt > 60_000) writeWindow = { startedAt: now, count: 0 };
  if (writeWindow.count >= MAX_WRITES_PER_MINUTE) return;
  writeWindow.count += 1;

  if (lastWriteByIp.size >= MAX_TRACKED_IPS) lastWriteByIp.clear();
  lastWriteByIp.set(ip, now);

  const lastPath = request.nextUrl.pathname.slice(0, 200);
  void db.visitor
    .upsert({
      where: { ip },
      create: { ip, lastPath },
      update: { lastSeenAt: new Date(), lastPath, visits: { increment: 1 } },
    })
    .catch((error) => console.error("Falha ao registrar visitante:", error));
}

/**
 * Primeira barreira da área administrativa. A autorização definitiva continua
 * sendo feita no servidor por requireAdmin() em cada página, ação e rota.
 */
export async function proxy(request: NextRequest) {
  recordVisit(request);
  const { pathname, search } = request.nextUrl;

  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const isLogin = pathname === "/admin/login";

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET);
  const authenticated = !!session && session.email === process.env.ADMIN_EMAIL;

  if (!authenticated && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    if (pathname !== "/admin") url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (authenticated && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

// Exclui /api (o upload de áudio passaria do limite de buffer do proxy) e arquivos estáticos.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
