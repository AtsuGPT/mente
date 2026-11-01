import { revalidatePath } from "next/cache";
import { deleteCategory, updateCategory } from "@/server/categories";
import { parseCategoryForm } from "@/server/validation";
import { error, json, requireAdminRequest } from "../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("Não consegui ler o formulário.", 400);
  }

  const parsed = parseCategoryForm(formData);
  if (!parsed.success) return error("Revise os campos destacados.", 422, { fieldErrors: parsed.fieldErrors });

  const result = await updateCategory((await context.params).id, parsed.data);
  if (!result.ok) return error(result.message ?? "Revise os campos destacados.", 422, { fieldErrors: result.fieldErrors });

  revalidatePath("/", "layout");
  return json({ category: result.data });
}

/** Remove a categoria; os pensamentos continuam existindo, apenas sem ela. */
export async function DELETE(_request: Request, context: Context) {
  const admin = await requireAdminRequest();
  if (admin instanceof Response) return admin;

  const result = await deleteCategory((await context.params).id);
  if (!result.ok) return error(result.message ?? "Não foi possível excluir.", 404);

  revalidatePath("/", "layout");
  return json({ ok: true });
}

export { preflight as OPTIONS } from "../../../_lib/http";
