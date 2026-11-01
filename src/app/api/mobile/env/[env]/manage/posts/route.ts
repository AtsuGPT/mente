import { revalidatePath } from "next/cache";
import { createPost, listAdminPosts, type AdminStatusFilter } from "@/server/posts";
import { parsePostForm } from "@/server/validation";
import { DEFAULT_ENVIRONMENT_ID } from "@/server/scope";
import { envAccess, error, json, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Pensamentos para gerenciar: todos (quem gerencia o conteúdo) ou só os próprios (quem publica). */
export async function GET(request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.permissions.manageContent && !access.permissions.publish) return error("Você não tem permissão para isso neste ambiente.", 403);
  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status");
  const status: AdminStatusFilter = statusParam === "draft" || statusParam === "published" ? statusParam : "all";
  return json(
    await listAdminPosts({
      environmentId: access.environment.id,
      authorId: access.permissions.manageContent ? undefined : access.userId ?? "-",
      q: params.get("q")?.slice(0, 100) || undefined,
      status,
      categoryId: params.get("categoria") || undefined,
      page: Number(params.get("pagina")) || 1,
    }),
  );
}

/** Cria um pensamento (mesmo FormData do editor do site); quem cria vira o autor. */
export async function POST(request: Request, context: EnvContext) {
  const access = await envAccess(context, "publish");
  if (access instanceof Response) return access;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("Não consegui ler o formulário.", 400);
  }
  const parsed = parsePostForm(formData);
  if (!parsed.success) return error("Revise os campos destacados.", 422, { fieldErrors: parsed.fieldErrors });
  const result = await createPost(parsed.data, { environmentId: access.environment.id, authorId: access.userId });
  if (!result.ok) return error(result.message ?? "Revise os campos destacados.", 422, { fieldErrors: result.fieldErrors });
  if (access.environment.id === DEFAULT_ENVIRONMENT_ID) revalidatePath("/", "layout");
  return json({ id: result.data.id }, { status: 201 });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
