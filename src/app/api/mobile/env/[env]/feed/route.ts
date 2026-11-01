import { listPublishedPosts } from "@/server/posts";
import { envAccess, json, type EnvContext } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Feed, pasta e busca do ambiente: ?categoria=slug&q=texto&de=AAAA-MM-DD&ate=AAAA-MM-DD&pagina=N */
export async function GET(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const params = new URL(request.url).searchParams;
  return json(
    await listPublishedPosts({
      scope: access.scope,
      categorySlug: params.get("categoria") || undefined,
      q: params.get("q") || undefined,
      from: params.get("de") || undefined,
      to: params.get("ate") || undefined,
      page: Number(params.get("pagina")) || 1,
    }),
  );
}

export { preflight as OPTIONS } from "../../../_lib/http";
