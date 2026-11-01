import { slugify } from "@/lib/slug";
import { listCategories } from "@/server/categories";
import { createPost } from "@/server/posts";
import { envAccess, error, json, readJson, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A Kally cria o pensamento como RASCUNHO no ambiente, a pedido da pessoa (botão no app):
 * { title, content, categories?: string[] (nomes) }. Nunca publica nem altera posts
 * existentes; a pessoa revisa e publica pelo editor. Exige permissão de publicar.
 */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context, "publish");
  if (access instanceof Response) return access;
  const body = await readJson(request, 220_000);
  if (body instanceof Response) return body;

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const content = typeof body.content === "string" ? body.content.slice(0, 200_000) : "";
  if (!title || !content.trim()) return error("O rascunho precisa de título e texto.", 400);

  const wanted = new Set((Array.isArray(body.categories) ? body.categories : []).filter((c): c is string => typeof c === "string").map((c) => c.trim().toLowerCase()));
  const categoryIds = (await listCategories(access.environment.id)).filter((c) => wanted.has(c.name.toLowerCase())).map((c) => c.id);

  const base = slugify(title).slice(0, 100) || "rascunho";
  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = attempt ? `${base}-${attempt + 1}` : base;
    const result = await createPost(
      { title, slug, content, private: false, categoryIds, publishedAt: null, intent: "save" },
      { environmentId: access.environment.id, authorId: access.userId },
    );
    if (result.ok) return json({ id: result.data.id, slug }, { status: 201 });
    if (!result.fieldErrors?.slug) return error("Não foi possível criar o rascunho.", 422, { fieldErrors: result.fieldErrors });
  }
  return error("Já existem pensamentos com esse endereço. Mude o título.", 409);
}

export { preflight as OPTIONS } from "../../../../_lib/http";
