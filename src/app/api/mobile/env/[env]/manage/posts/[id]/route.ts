import { revalidatePath } from "next/cache";
import { toDatetimeLocal } from "@/lib/format";
import { canEditPost } from "@/server/environments";
import { deletePost, getAdminPost, updatePost } from "@/server/posts";
import { parsePostForm } from "@/server/validation";
import { DEFAULT_ENVIRONMENT_ID } from "@/server/scope";
import { envAccess, error, json } from "../../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

async function editable(context: Context) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  const post = await getAdminPost((await context.params).id, access.environment.id);
  if (!post) return error("Pensamento não encontrado.", 404);
  if (!canEditPost(access, post)) return error("Você não pode editar este pensamento.", 403);
  return { access, post };
}

export async function GET(_request: Request, context: Context) {
  const found = await editable(context);
  if (found instanceof Response) return found;
  return json({ post: { ...found.post, publishedAtLocal: toDatetimeLocal(found.post.publishedAt) } });
}

export async function PUT(request: Request, context: Context) {
  const found = await editable(context);
  if (found instanceof Response) return found;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("Não consegui ler o formulário.", 400);
  }
  const parsed = parsePostForm(formData);
  if (!parsed.success) return error("Revise os campos destacados.", 422, { fieldErrors: parsed.fieldErrors });
  const result = await updatePost(found.post.id, parsed.data, found.access.environment.id);
  if (!result.ok) return error(result.message ?? "Revise os campos destacados.", result.message ? 404 : 422, { fieldErrors: result.fieldErrors });
  if (found.access.environment.id === DEFAULT_ENVIRONMENT_ID) revalidatePath("/", "layout");
  return json({ id: result.data.id, intent: parsed.data.intent });
}

export async function DELETE(_request: Request, context: Context) {
  const found = await editable(context);
  if (found instanceof Response) return found;
  const result = await deletePost(found.post.id, found.access.environment.id);
  if (!result.ok) return error(result.message ?? "Não foi possível excluir.", 404);
  if (found.access.environment.id === DEFAULT_ENVIRONMENT_ID) revalidatePath("/", "layout");
  return json({ ok: true });
}

export { preflight as OPTIONS } from "../../../../../_lib/http";
