import { listPublishedPosts } from "@/server/posts";
import { json, requireRole } from "../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Feed, categoria e busca (mesmos filtros de /buscar):
 * ?categoria=slug&q=texto&de=AAAA-MM-DD&ate=AAAA-MM-DD&pagina=N
 */
export async function GET(request: Request) {
  const role = await requireRole();
  if (role instanceof Response) return role;

  const params = new URL(request.url).searchParams;
  const result = await listPublishedPosts({
    categorySlug: params.get("categoria") || undefined,
    q: params.get("q") || undefined,
    from: params.get("de") || undefined,
    to: params.get("ate") || undefined,
    page: Number(params.get("pagina")) || 1,
  });
  return json(result);
}

export { preflight as OPTIONS } from "../_lib/http";
