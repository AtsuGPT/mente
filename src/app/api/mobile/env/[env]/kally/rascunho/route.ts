import { slugify } from "@/lib/slug";
import { listCategories } from "@/server/categories";
import { createPost } from "@/server/posts";
import { postSchema } from "@/server/validation";
import { envAccess, error, json, readJson, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A Kally salva o pensamento preparado no chat, a pedido da pessoa (botão no app, depois
 * da confirmação): { title, content, categories?: string[] (nomes), publish?: boolean, private?: boolean }.
 *
 * - Usa o mesmo createPost e a mesma validação (postSchema) do editor: não há outro
 *   caminho de publicação.
 * - O ambiente é o da URL (o da conversa) e a permissão é a da própria pessoa
 *   ("publish"), igual ao editor; nada de privilégio extra para a Kally.
 * - publish: true publica agora; sem ele, fica como rascunho. Nunca altera posts existentes.
 * - O modelo nunca chama esta rota: só o botão de confirmação no app.
 */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context, "publish");
  if (access instanceof Response) return access;
  const body = await readJson(request, 220_000);
  if (body instanceof Response) return body;

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const content = typeof body.content === "string" ? body.content.slice(0, 200_000) : "";
  if (!title || !content.trim()) return error("O pensamento precisa de título e texto.", 400);
  const publish = body.publish === true;

  const wanted = new Set((Array.isArray(body.categories) ? body.categories : []).filter((c): c is string => typeof c === "string").map((c) => c.trim().toLowerCase()));
  const categoryIds = (await listCategories(access.environment.id)).filter((c) => wanted.has(c.name.toLowerCase())).map((c) => c.id);

  const base = slugify(title).slice(0, 100) || "pensamento";
  for (let attempt = 0; attempt < 6; attempt++) {
    const parsed = postSchema.safeParse({
      title,
      slug: attempt ? `${base}-${attempt + 1}` : base,
      content,
      private: body.private === true,
      categoryIds,
      publishedAt: null,
      intent: publish ? "publish" : "save",
    });
    if (!parsed.success) return error("Revise o título e o texto.", 422, { fieldErrors: parsed.error.flatten().fieldErrors });
    const result = await createPost(parsed.data, { environmentId: access.environment.id, authorId: access.userId });
    if (result.ok) {
      return json(
        { id: result.data.id, slug: parsed.data.slug, status: publish ? "PUBLISHED" : "DRAFT", environment: { id: access.environment.id, name: access.environment.name } },
        { status: 201 },
      );
    }
    if (!result.fieldErrors?.slug) return error("Não foi possível salvar o pensamento.", 422, { fieldErrors: result.fieldErrors });
  }
  return error("Já existem pensamentos com esse endereço. Mude o título.", 409);
}

export { preflight as OPTIONS } from "../../../../_lib/http";
