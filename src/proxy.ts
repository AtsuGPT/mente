import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

/**
 * Primeira barreira da área administrativa. A autorização definitiva continua
 * sendo feita no servidor por requireAdmin() em cada página, ação e rota.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
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

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
