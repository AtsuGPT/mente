import { revalidatePath } from "next/cache";
import { createCategory, listCategoriesWithAllCounts } from "@/server/categories";
import { parseCategoryForm } from "@/server/validation";
import { DEFAULT_ENVIRONMENT_ID } from "@/server/scope";
import { envAccess, error, json, type EnvContext } from "../../../../_lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Todas as categorias do ambiente (para o editor de quem publica e para quem gerencia). */
export async function GET(_request: Request, context: EnvContext) {
  const access = await envAccess(context);
  if (access instanceof Response) return access;
  if (!access.permissions.publish && !access.permissions.manageContent) return error("Você não tem permissão para isso neste ambiente.", 403);
  return json({ categories: await listCategoriesWithAllCounts(access.environment.id) });
}

export async function POST(request: Request, context: EnvContext) {
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
  const result = await createCategory(parsed.data, access.environment.id);
  if (!result.ok) return error(result.message ?? "Revise os campos destacados.", 422, { fieldErrors: result.fieldErrors });
  if (access.environment.id === DEFAULT_ENVIRONMENT_ID) revalidatePath("/", "layout");
  return json({ category: result.data }, { status: 201 });
}

export { preflight as OPTIONS } from "../../../../_lib/http";
