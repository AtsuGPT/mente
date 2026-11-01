import { revalidatePath } from "next/cache";
import { deleteCategory, updateCategory } from "@/server/categories";
import { parseCategoryForm } from "@/server/validation";
import { DEFAULT_ENVIRONMENT_ID } from "@/server/scope";
import { envAccess, error, json } from "../../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ env: string; id: string }> };

export async function PUT(request: Request, context: Context) {
  const access = await envAccess(context, "manageContent");
  if (access instanceof Response) return access;
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("Não consegui ler o formulário.", 400);
  }
  const parsed = parseCategoryForm(formData);
  if (!parsed.success) return error("Revise os campos destacados.", 422, { fieldErrors: parsed.fieldErrors });
  const result = await updateCategory((await context.params).id, parsed.data, access.environment.id);
  if (!result.ok) return error(result.message ?? "Revise os campos destacados.", result.message ? 404 : 422, { fieldErrors: result.fieldErrors });
  if (access.environment.id === DEFAULT_ENVIRONMENT_ID) revalidatePath("/", "layout");
  return json({ category: result.data });
}

/** Os pensamentos continuam existindo, apenas sem esta categoria. */
export async function DELETE(_request: Request, context: Context) {
  const access = await envAccess(context, "manageContent");
  if (access instanceof Response) return access;
  const result = await deleteCategory((await context.params).id, access.environment.id);
  if (!result.ok) return error(result.message ?? "Não foi possível excluir.", 404);
  if (access.environment.id === DEFAULT_ENVIRONMENT_ID) revalidatePath("/", "layout");
  return json({ ok: true });
}

export { preflight as OPTIONS } from "../../../../../_lib/http";
